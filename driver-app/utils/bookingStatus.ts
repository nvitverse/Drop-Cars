// Single source of truth for the booking lifecycle label shown to users.
// Precedence matches the owner's spec exactly - most-final state wins:
// Completed > Started > Cancelled/Auto Cancelled/Removed > Assigned > Accepted > Waiting.
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

  // Cancellations take priority over generic trip_status
  if (tripStatus.includes('CANCEL') || assignmentStatus.includes('CANCEL') || cancelledBy.includes('CANCEL')) {
    if (cancelledBy === 'CANCELLED_BY_VENDOR') return 'Cancelled';
    if (cancelledBy === 'AUTO_CANCELLED' || assignmentStatus === 'AUTO_CANCELLED') {
      return wasAccepted ? 'Auto Cancelled' : 'Removed';
    }
    return 'Cancelled';
  }

  if (tripStatus === 'COMPLETED' || assignmentStatus === 'COMPLETED') return 'Completed';
  if (assignmentStatus === 'DRIVING') return 'Started';

  if (order.Driver_assigned && order.Car_assigned) return 'Assigned';
  if (assignmentStatus === 'ASSIGNED') return 'Assigned';
  if (wasAccepted) return 'Accepted';
  return 'Waiting';
}

// Additive helper for the Active tab's "Running" segment only. It does NOT
// change getBookingStatusLabel above (other screens rely on that function's
// exact current behavior) - it's a separate, looser check layered on top:
// a booking counts as "running" once assignment_status is DRIVING, OR the
// booking is still ASSIGNED but its scheduled pickup time has already
// passed (the duty driver may never explicitly tap "Start Trip").
export function isEffectivelyRunning(
  order: Pick<BookingStatusFields, 'assignment_status'> & { start_date_time?: string | null }
): boolean {
  const assignmentStatus = (order.assignment_status || '').toUpperCase();
  if (assignmentStatus === 'DRIVING') return true;
  if (assignmentStatus === 'ASSIGNED' && order.start_date_time) {
    const start = new Date(order.start_date_time);
    if (!isNaN(start.getTime()) && start.getTime() < Date.now()) return true;
  }
  return false;
}
