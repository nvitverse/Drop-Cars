# models/order_assignments.py
from sqlalchemy import Column, String, TIMESTAMP, Integer, func, JSON, Enum as SqlEnum, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
import uuid
import enum
from app.database.session import Base
from datetime import datetime

# Make sure foreign key target tables are registered in SQLAlchemy Metadata
import app.models.orders
import app.models.vehicle_owner
import app.models.vehicle_owner_details
import app.models.car_driver
import app.models.car_details


class AssignmentStatusEnum(str, enum.Enum):
    PENDING = "PENDING"
    ASSIGNED = "ASSIGNED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"
    DRIVING = "DRIVING"


class OrderAssignment(Base):
    __tablename__ = "order_assignments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    vehicle_owner_id = Column(UUID(as_uuid=True), ForeignKey("vehicle_owner.id"), nullable=False)
    driver_id = Column(UUID(as_uuid=True), ForeignKey("car_driver.id"), nullable=True)
    car_id = Column(UUID(as_uuid=True), ForeignKey("car_details.id"), nullable=True)

    assignment_status = Column(SqlEnum(AssignmentStatusEnum), nullable=False, default=AssignmentStatusEnum.PENDING)

    assigned_at = Column(TIMESTAMP)
    expires_at = Column(TIMESTAMP)
    cancelled_at = Column(TIMESTAMP)
    # Why THIS owner's assignment specifically was cancelled - distinct from
    # Order.cancelled_by, which only reflects the order's final fate and
    # stays null when the booking is reposted to other fleet owners instead
    # of being fully cancelled (see cancel_timed_out_pending_assignments and
    # the admin unallocate-with-penalty endpoints). Without this, the
    # Executed tab's Unallocated segment had no way to tell "this owner's
    # window timed out" apart from a generic cancel for any reposted order.
    cancel_reason = Column(String, nullable=True)
    # Human-readable reason for this owner's assignment ending (shown in the Driver App)
    cancel_note = Column(String, nullable=True)
    # How many "assign driver & car before the deadline" warnings the
    # accepting fleet driver has been sent (0 none, 1 at 10 min, 2 at 3 min).
    deadline_warning_stage = Column(Integer, nullable=False, default=0, server_default="0")
    completed_at = Column(TIMESTAMP)
    created_at = Column(TIMESTAMP, default=datetime.utcnow)
    # Snapshotted at accept time (see crud/billing.py get_partner_tier) - a
    # later renewal or lapse must never retroactively change an
    # already-accepted trip's commission split.
    accepted_tier = Column(String, nullable=True)
    # The exact commission-hold amount debited from the fleet owner's wallet
    # at accept time (see accept_order's hold_amount calc) - snapshotted here
    # so it can be shown back to the vendor and reused unchanged at trip
    # close for the advance-settlement calculation, instead of recomputing a
    # formula that could drift if the order's price is edited afterward.
    held_amount = Column(Integer, nullable=True)

    # Who put this assignment in place - 'SELF' (the fleet owner accepted it
    # themselves via the normal race-to-accept flow), 'VENDOR' (the vendor
    # directly assigned it to this fleet owner via the Assign Duty search),
    # or 'ADMIN' (admin's manual-assign tool). Purely a display distinction -
    # ("Accepted" vs "Allocated" in the UI) - assignment_status itself is the
    # same ASSIGNED value either way. Defaults to 'SELF' so every existing
    # accept_order-created row (before this column existed) reads correctly.
    assigned_by = Column(String, nullable=False, default="SELF", server_default="SELF")

    # Trip-integrity OTPs: generated once, the moment a driver+car is
    # assigned, and emailed to the customer alongside the driver/vehicle
    # details (see app/utils/website_status_webhook.py). The DRIVER must
    # enter the matching OTP to actually start or close the trip (see
    # api/routes/order_assignments.py's start_trip/end_trip) - this proves
    # the driver physically reached the real customer, not someone else,
    # and that the customer (not the driver) is the one confirming
    # trip-end.
    start_trip_otp = Column(String, nullable=True)
    end_trip_otp = Column(String, nullable=True)

    # Live location, pushed from the website's browser-based driver-trip
    # link (pages/driver-trip.php) via navigator.geolocation.watchPosition
    # while that page stays open in the driver's phone browser - no Driver
    # App changes needed. See api/routes/website_bookings.py's
    # /website/trip-link/* endpoints and pages/track-booking.php (customer
    # side) which polls these back.
    last_lat = Column(String, nullable=True)
    last_lng = Column(String, nullable=True)
    revised_offer_price = Column(Integer, nullable=True)
    rebid_status = Column(String, nullable=True)
    last_location_at = Column(TIMESTAMP, nullable=True)

    # Per-assignment secret used to build the shareable driver-trip link
    # (no Driver App login required to open it) - generated once, the
    # moment a driver+car is assigned, alongside start_trip_otp/end_trip_otp.
    trip_link_token = Column(String, nullable=True, unique=True)

    # Stamped when the driver-trip page detects it was backgrounded/closed
    # (visibilitychange/pagehide, sent via navigator.sendBeacon - see
    # driver-trip.php), cleared the moment a fresh location ping arrives.
    # Lets track-booking.php show "driver paused sharing" instead of a
    # silently-stale map. A website page can't actually force the tab to
    # stay open - this is detection/reporting, not real enforcement.
    tracking_left_at = Column(TIMESTAMP, nullable=True)

    # GPS-spoof fraud detection flag (speed > 140 km/h between pings)
    is_location_flagged = Column(Boolean, nullable=False, default=False, server_default="false")
    location_flag_reason = Column(String, nullable=True)

    # Optional: define relationships if needed
    # order = relationship("NewOrder")
    # driver = relationship("CarDriver")
    # car = relationship("CarDetail")
    # owner = relationship("VehicleOwner")