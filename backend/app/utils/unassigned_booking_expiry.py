import logging
from typing import Dict, Any
from sqlalchemy.orm import Session

from app.models.platform_setting import PlatformSetting

logger = logging.getLogger(__name__)

DEFAULT_UNASSIGNED_REMOVAL_TIMEOUT_MINS = 30


def get_unassigned_removal_timeout(db: Session) -> int:
    """Fetches Admin Configurable Unassigned Booking Removal Timeout (Default: 30 Mins)."""
    setting = db.query(PlatformSetting).filter(
        PlatformSetting.key == "ASSIGNMENT_PRIORITY_ASSIGNMENT_DEFAULT_MINS"
    ).first()
    if setting and setting.value and setting.value.isdigit():
        return int(setting.value)
    return DEFAULT_UNASSIGNED_REMOVAL_TIMEOUT_MINS


def auto_remove_unassigned_bookings(db: Session, custom_timeout_mins: int = None) -> Dict[str, Any]:
    """Run the real deadline sweep on demand (admin "run now" button).

    This used to be a separate engine that filtered NewOrder.Driver_assigned /
    Car_assigned - columns that do not exist - so it always hit its except
    branch and reported success with 0. The production auto-removal is the
    every-minute sweep in main.py (_run_assignment_sweep); this now runs the
    same steps in the same order:
      1. warn fleet drivers whose assign-by deadline is close,
      2. remove assignments whose deadline passed (penalty, repost),
      3. urgent re-push for unaccepted bookings near their deadline,
      4. cancel unaccepted bookings past their deadline.
    custom_timeout_mins is kept for API compatibility; deadlines are per
    booking (OrderAssignment.expires_at / Order.acceptance_deadline).
    """
    import asyncio
    from app.crud.order_assignments import (
        send_assignment_deadline_warnings,
        cancel_timed_out_pending_assignments,
        send_urgent_booking_reminders,
        cancel_expired_unaccepted_orders,
    )

    async def _run():
        warned = await send_assignment_deadline_warnings(db)
        removed = await cancel_timed_out_pending_assignments(db)
        reminded = await send_urgent_booking_reminders(db)
        try:
            from app.crud.unaccepted_desk import push_due_alarms
            await push_due_alarms(db)
        except Exception as e:      # noqa: BLE001
            print(f"unaccepted desk push failed (sweep continues): {e}")
        expired = await cancel_expired_unaccepted_orders(db)
        return warned, removed, reminded, expired

    try:
        asyncio.get_running_loop()
        running = True
    except RuntimeError:
        running = False
    if running:
        # Called from inside an event loop: run in a worker thread with its own loop.
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=1) as pool:
            warned, removed, reminded, expired = pool.submit(asyncio.run, _run()).result()
    else:
        warned, removed, reminded, expired = asyncio.run(_run())

    timeout_used = custom_timeout_mins or get_unassigned_removal_timeout(db)
    return {
        "success": True,
        "timeout_minutes_used": timeout_used,
        "processed_count": int(removed or 0) + int(expired or 0),
        "deadline_warnings_sent": int(warned or 0),
        "assignments_removed": int(removed or 0),
        "urgent_reminders_sent": int(reminded or 0),
        "unaccepted_cancelled": int(expired or 0),
        "expired_order_ids": [],
    }
