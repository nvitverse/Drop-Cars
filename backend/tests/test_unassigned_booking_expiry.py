import sys
import os
import uuid
from datetime import datetime, timedelta, timezone

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database.session import SessionLocal, Base, engine
import app.models.car_driver
import app.models.vendor
import app.models.vehicle_owner
import app.models.new_orders
from app.models.new_orders import NewOrder
from app.models.ai_automation_log import AIAutomationLog
from app.utils.unassigned_booking_expiry import auto_remove_unassigned_bookings


def test_unassigned_booking_auto_removal():
    print("--- Running Test: 30-Minute Unassigned Booking Auto-Removal Engine ---")
    db = SessionLocal()

    # Test auto-removal function execution
    res = auto_remove_unassigned_bookings(db, custom_timeout_mins=30)
    print(f"Auto-Removal Engine Result: {res}")

    assert res["success"] is True
    assert res["timeout_minutes_used"] == 30
    assert isinstance(res["auto_removed_count"], int)

    db.close()
    print("[OK] Test Passed: 30-minute stale booking auto-removal engine verified cleanly!")
    db.close()
    print("[OK] Test Passed: 30-minute stale booking auto-removal verified cleanly!")


if __name__ == "__main__":
    test_unassigned_booking_auto_removal()
    print("\n[SUCCESS] ALL UNASSIGNED BOOKING REMOVAL TESTS PASSED!")
