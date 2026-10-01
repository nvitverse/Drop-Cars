from sqlalchemy import Column, String, TIMESTAMP, Integer, func, JSON, Enum as SqlEnum, ForeignKey, Boolean, Interval
from sqlalchemy.dialects.postgresql import UUID, ARRAY
import enum
from app.database.session import Base
from app.models.new_orders import OrderTypeEnum, CarTypeEnum, FareTypeEnum

class Trip_status(str,enum.Enum): 
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    AUTO_CANCELLED = "AUTO_CANCELLED"
    CANCELLED_BY_VENDOR = "CANCELLED_BY_VENDOR"
    CANCELLED_WHILE_DRIVING = "CANCELLED_WHILE_DRIVING"
    CANCELLED_BY_CUSTOMER = "CANCELLED_BY_CUSTOMER"
    CANCELLED_BY_ADMIN = "CANCELLED_BY_ADMIN"

class CancelledByEnum(str, enum.Enum):
    AUTO_CANCELLED = "AUTO_CANCELLED"
    CANCELLED_BY_VENDOR = "CANCELLED_BY_VENDOR"
    CANCELLED_WHILE_DRIVING = "CANCELLED_WHILE_DRIVING"
    CANCELLED_BY_CUSTOMER = "CANCELLED_BY_CUSTOMER"
    CANCELLED_BY_ADMIN = "CANCELLED_BY_ADMIN"

class OrderSourceEnum(str, enum.Enum):
    NEW_ORDERS = "NEW_ORDERS"
    HOURLY_RENTAL = "HOURLY_RENTAL"


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    source = Column(SqlEnum(OrderSourceEnum, name="ORDER_SOURCE_ENUM"), nullable=False)
    source_order_id = Column(Integer, nullable=False)

    vendor_id = Column(UUID(as_uuid=True), ForeignKey("vendor.id"), nullable=True)
    trip_type = Column(SqlEnum(OrderTypeEnum, name="ORDER_TYPE_ENUM"), nullable=False)
    car_type = Column(SqlEnum(CarTypeEnum, name="CAR_TYPE_ENUM"), nullable=False)
    pickup_drop_location = Column(JSON, nullable=False)
    start_date_time = Column(TIMESTAMP(timezone=True), nullable=False)
    end_date_time = Column(TIMESTAMP(timezone=True), nullable=True)
    customer_name = Column(String, nullable=False)
    customer_number = Column(String, nullable=False)

    # Optional shared financials/summaries
    trip_status = Column(SqlEnum(Trip_status,name="Trip_status"),nullable=False)
    pick_near_city = Column(ARRAY(String), nullable=True)
    # Set when this order was posted directly to one driver instead of
    # broadcast by city - see NewOrder.target_driver_id.
    target_driver_id = Column(UUID(as_uuid=True), ForeignKey("car_driver.id"), nullable=True)
    # Set when a driver posted this booking themselves (Driver App's Create
    # Booking) for the open pool of drivers to accept - NOT necessarily the
    # driver who ends up accepting/driving it. At trip close, the posting
    # bonus (vendor_profit share) goes to THIS owner's wallet, not
    # assignment.vehicle_owner_id, since those can now be two different
    # people (see crud/end_records.py's update_end_trip_record).
    posted_by_vehicle_owner_id = Column(UUID(as_uuid=True), ForeignKey("vehicle_owner.id"), nullable=True)
    trip_distance = Column(Integer, nullable=True)
    trip_time = Column(String, nullable=True)
    # Quote-review distance override (booking-only, never written back to the
    # route_distances cache). Flagged for admin visibility on the orders list.
    distance_edited = Column(Boolean, nullable=False, server_default='false')
    calculated_trip_distance = Column(Integer, nullable=True)
    # Per-stop address/maps link (see NewOrder.location_links). Copied over
    # at booking-master-creation time; shown to drivers before they accept.
    location_links = Column(JSON, nullable=True)
    estimated_price = Column(Integer, nullable=True)
    vendor_price = Column(Integer, nullable=True)
    platform_fees_percent = Column(Integer, nullable=True)
    vendor_fees_percent = Column(Integer, nullable=True)
    # "10% CC" toggle (added 2026-09-04) - True means the poster (currently
    # only Driver App's own-created bookings) switched OFF the platform's
    # usual commission for this specific booking; end_records.py's
    # update_end_trip_record checks this and skips taking admin_profit,
    # giving that share to the driver instead. False (default) = normal,
    # unchanged commission behavior.
    commission_waived = Column(Boolean, nullable=False, server_default='false')

    # Toll updates
    toll_charge_update = Column(Boolean, nullable=False, server_default='false')
    updated_toll_charges = Column(Integer, nullable=True)

    # Maximum time allowed to assign order to a driver/car
    # Default: 15 minutes from creation
    max_time_to_assign_order = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    # Vendor-editable deadline for a driver to ACCEPT the booking at all.
    # Defaults to start_date_time + 15min at creation; vendor can push it out
    # further for advance bookings posted days ahead. Nullable - old rows
    # fall back to the legacy pickup+15min rule in the sweep job.
    acceptance_deadline = Column(TIMESTAMP(timezone=True), nullable=True)

    # How many times the "urgent, about to expire" reminder push has fired
    # for this still-unaccepted booking. Capped in the sweep so a booking
    # can't get spammed forever - see send_urgent_booking_reminders.
    urgent_notify_count = Column(Integer, nullable=False, server_default='0')

    # Trip Start/End OTPs, created when the booking is posted (not when a
    # driver is assigned) so the vendor can hand them to the customer
    # straight away. Every assignment for this booking copies these same
    # values (crud/trip_otp.py) - a reassignment never invalidates codes the
    # customer already has. OrderAssignment.start_trip_otp/end_trip_otp stay
    # the values start/end-trip actually verify against.
    start_trip_otp = Column(String, nullable=True)
    end_trip_otp = Column(String, nullable=True)

    # Visibility approval by vendor: whether fleet owners can see customer info
    data_visibility_vehicle_owner = Column(Boolean, nullable=False, server_default='false')
    # Admin chose a fixed moment for the driver to see the customer number
    # ("6 hrs before" / a picked date & time). Null = the automatic rule.
    customer_phone_reveal_at = Column(TIMESTAMP(timezone=True), nullable=True)

    # Closing amounts (set when order is completed)
    closed_vendor_price = Column(Integer, nullable=True)
    closed_driver_price = Column(Integer, nullable=True)
    commision_amount = Column(Integer, nullable=True)

    # Profit allocations (set when order is completed)
    vendor_profit = Column(Integer, nullable=True)
    driver_profit = Column(Integer, nullable=True)
    admin_profit = Column(Integer, nullable=True)

    # Additional charges/metrics
    night_charges = Column(Integer, nullable=True)
    waiting_time = Column(Integer, nullable=True)

    # Cancellation tracking
    cancelled_by = Column(SqlEnum(CancelledByEnum, name="cancelled_by_enum"), nullable=True)
    # Human-readable reason typed/picked by whoever cancelled (shown to the driver)
    cancel_note = Column(String, nullable=True)
    # Commission class stamped when the booking is created (STANDARD / POSTER_ALL_INCLUSIVE /
    # PLATFORM_ALL_INCLUSIVE - see utils/commission.py). Null on older bookings: inferred from fare type + poster.
    commission_class = Column(String, nullable=True)
    # GST bridge (not wired into settlement yet): % GST the poster included in the price they posted. The GST part belongs
    # to the POSTER (utils/commission.py compute_split takes gst_amount for when this is switched on).
    gst_percent = Column(Integer, nullable=True)

    # Special requirements the vendor can flag when posting a trip (see
    # NewOrder for the source-of-truth comment). Copied over at
    # booking-master-creation time; the driver app warns in red before accept.
    car_make_year_requirement = Column(Integer, nullable=True)
    carrier_required = Column(Boolean, nullable=False, server_default='false')

    # Priority window (see NewOrder for the source-of-truth comment). Copied
    # over at booking-master-creation time.
    priority_for_paid = Column(Boolean, nullable=False, server_default='true')
    priority_cutoff_at = Column(TIMESTAMP(timezone=True), nullable=True)

    # Fare transparency (see NewOrder for the source-of-truth comment).
    fare_type = Column(SqlEnum(FareTypeEnum, name="fare_type_enum"), nullable=False, server_default='ITEMIZED')
    charge_items = Column(JSON, nullable=True)

    # Cash settlement (see NewOrder for the source-of-truth comment).
    advance_received = Column(Integer, nullable=True)

    # All-Inclusive pricing (see NewOrder for the source-of-truth comment).
    total_booking_amount = Column(Integer, nullable=True)
    extra_amount = Column(Integer, nullable=True)
    waiting_hours_included = Column(Integer, nullable=True)

    # Website "Urgent" flag (see NewOrder for the source-of-truth comment).
    is_urgent = Column(Boolean, nullable=False, default=False, server_default='false')
    gst_included = Column(Boolean, nullable=False, default=False, server_default='false')
    gst_amount = Column(Integer, nullable=True)

    # Which platform/app the booking was actually executed on. Every order
    # created through this codebase's own flows (app/website) is
    # auto-stamped "Drop Cars App" at creation time - see
    # create_master_from_new_order/create_master_from_hourly in crud/orders.py.
    # Admin can override this afterward (PATCH /admin/orders/{id}/executed-platform)
    # for the case where staff manually logged a booking that was actually
    # fulfilled through a different channel (e.g. an MMT/partner referral),
    # so reporting can tell the two apart.
    executed_platform = Column(String, nullable=False, server_default='Drop Cars App')

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


