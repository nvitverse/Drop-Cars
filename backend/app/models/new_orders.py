# models/new_orders.py
from sqlalchemy import Column, String, TIMESTAMP, Integer, func, JSON, Enum as SqlEnum, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID, ARRAY
import uuid
import enum
from app.database.session import Base

class OrderTypeEnum(enum.Enum):
    ONEWAY = "Oneway"
    ROUND_TRIP = "Round Trip"
    HOURLY_RENTAL = "Hourly Rental"
    MULTY_CITY = "Multy City"
    LOCAL = "Local"

class FareTypeEnum(enum.Enum):
    ALL_INCLUSIVE = "ALL_INCLUSIVE"
    ITEMIZED = "ITEMIZED"

class CarTypeEnum(enum.Enum):
    HATCHBACK = "HATCHBACK"
    SEDAN_4_PLUS_1 = "SEDAN_4_PLUS_1"
    NEW_SEDAN_2022_MODEL = "NEW_SEDAN_2022_MODEL"
    ETIOS_4_PLUS_1 = "ETIOS_4_PLUS_1"
    SUV = "SUV"
    SUV_6_PLUS_1 = "SUV_6_PLUS_1"
    SUV_7_PLUS_1 = "SUV_7_PLUS_1"
    INNOVA = "INNOVA"
    INNOVA_6_PLUS_1 = "INNOVA_6_PLUS_1"
    INNOVA_7_PLUS_1 = "INNOVA_7_PLUS_1"
    INNOVA_CRYSTA = "INNOVA_CRYSTA"
    INNOVA_CRYSTA_6_PLUS_1 = "INNOVA_CRYSTA_6_PLUS_1"
    INNOVA_CRYSTA_7_PLUS_1 = "INNOVA_CRYSTA_7_PLUS_1"
    TEMPO_TRAVELLER_12 = "TEMPO_TRAVELLER_12"
    TEMPO_TRAVELLER_14 = "TEMPO_TRAVELLER_14"
    TEMPO_TRAVELLER_18 = "TEMPO_TRAVELLER_18"
    URBANIA_12 = "URBANIA_12"
    URBANIA_14 = "URBANIA_14"
    URBANIA_16 = "URBANIA_16"


class NewOrder(Base):
    __tablename__ = "new_orders"

    order_id  = Column(Integer, primary_key=True, autoincrement=True)
    vendor_id = Column(UUID(as_uuid=True), ForeignKey("vendor.id"), nullable=True)
    trip_type = Column(
        SqlEnum(OrderTypeEnum, name="ORDER_TYPE_ENUM"),
        nullable=False
    )
    car_type = Column(
        SqlEnum(CarTypeEnum, name="CAR_TYPE_ENUM"),
        nullable=False
    )
    pickup_drop_location = Column(JSON, nullable=False)
    start_date_time = Column(TIMESTAMP(timezone=True), nullable=False)
    # Round Trip "return" / Multi City "drop" date+time. Nullable - Oneway and
    # Hourly Rental don't use it, and it defaults client-side to the start
    # date at 9:30 PM for same-day trips.
    end_date_time = Column(TIMESTAMP(timezone=True), nullable=True)
    customer_name = Column(String, nullable=False)
    customer_number = Column(String, nullable=False)
    cost_per_km = Column(Integer, nullable=False)
    extra_cost_per_km = Column(Integer, nullable=False)
    driver_allowance = Column(Integer, nullable=False)
    extra_driver_allowance = Column(Integer, nullable=False)
    permit_charges = Column(Integer, nullable=False)
    extra_permit_charges = Column(Integer, nullable=False)
    hill_charges = Column(Integer, nullable=False)
    toll_charges = Column(Integer, nullable=False)
    pickup_notes = Column(String, nullable=True)
    trip_status = Column(String, nullable=False)
    pick_near_city = Column(ARRAY(String), nullable=False)
    trip_distance = Column(Integer,nullable=False)
    trip_time = Column(String, nullable=False)
    # Quote-review distance override (booking-only, never written back to the
    # route_distances cache). trip_distance above is the FINAL billed km;
    # calculated_trip_distance preserves what Maps/cache actually returned so
    # admin can see both.
    distance_edited = Column(Boolean, nullable=False, server_default='false')
    calculated_trip_distance = Column(Integer, nullable=True)
    # Per-stop address/maps link, keyed the same way as pickup_drop_location
    # (e.g. {"0": "https://maps.google.com/...", "1": "Door No 4, Main St"}).
    # Prefilled client-side with the city name; vendor can overwrite with a
    # real link or a plain address. Booking-only, shown to drivers before
    # they accept.
    location_links = Column(JSON, nullable=True)
    platform_fees_percent = Column(Integer,nullable=False)
    estimated_price = Column(Integer, nullable=True)
    vendor_price  = Column(Integer, nullable=True)
    # "10% CC" toggle (added 2026-09-04) - see the matching column on
    # models/orders.py's Order for the full explanation. Carried through
    # to the master Order row by create_master_from_new_order.
    commission_waived = Column(Boolean, nullable=False, server_default='false')
    # Special requirements the vendor can flag when posting a trip. Both are
    # opt-in and off by default (no special requirement); when set, the driver
    # app must warn the driver in red before they accept.
    car_make_year_requirement = Column(Integer, nullable=True)
    carrier_required = Column(Boolean, nullable=False, server_default='false')
    # Set when the vendor posts this trip directly to one driver (send_to =
    # "DRIVER") instead of broadcasting by city - see app/crud/notification.py:
    # send_new_booking_notification_to_driver_sync. Null for the normal
    # ALL/NEAR_CITY flow.
    target_driver_id = Column(UUID(as_uuid=True), ForeignKey("car_driver.id"), nullable=True)
    # Set when a driver posted this booking themselves (Driver App's Create
    # Booking) - see Order.posted_by_vehicle_owner_id for why this is kept
    # separate from whoever ends up accepting/driving it.
    posted_by_vehicle_owner_id = Column(UUID(as_uuid=True), ForeignKey("vehicle_owner.id"), nullable=True)
    # Priority window: while true and before priority_cutoff_at, only
    # Preferred-tier drivers can accept this booking. Defaults to on with a
    # server-computed cutoff (midpoint between posting and pickup, or a
    # 5-minute floor for immediate bookings) - vendor can override the time
    # or turn the whole window off per booking.
    priority_for_paid = Column(Boolean, nullable=False, server_default='true')
    priority_cutoff_at = Column(TIMESTAMP(timezone=True), nullable=True)
    # Fare transparency: whether the posted total is all-inclusive or the
    # existing itemized/additive charge fields (default - matches today's
    # behavior unchanged). charge_items is a display-only breakdown of which
    # named charges (presets: Toll, State Tax, Parking, Waiting, plus any
    # vendor-added custom ones) are bundled into the total vs. collected
    # extra - e.g. [{"label": "Toll", "included": false}, ...]. The Toll
    # preset's "included" flag is kept in sync with toll_charge_update
    # (already has real trip-close behavior) rather than duplicating it.
    fare_type = Column(SqlEnum(FareTypeEnum, name="fare_type_enum"), nullable=False, server_default='ITEMIZED')
    charge_items = Column(JSON, nullable=True)
    # Cash settlement: amount already collected upfront (e.g. online
    # prepayment) before the trip starts, set by the vendor at posting time.
    # Whatever's left of the total is what the driver physically collects in
    # cash from the customer at trip end - see EndRecord.cash_collection and
    # crud/end_records.py's settlement math.
    advance_received = Column(Integer, nullable=True)
    # All-Inclusive pricing: when fare_type is ALL_INCLUSIVE, the poster
    # types one flat driver amount (total_booking_amount) plus their own
    # markup on top (extra_amount) instead of the itemized km/allowance
    # fields above. See crud/end_records.py's All-Inclusive commission rule -
    # vendor_profit = extra_amount, admin_profit = 5% of total_booking_amount,
    # driver_profit = total_booking_amount - admin_profit. Null/unused for
    # ITEMIZED bookings. waiting_hours_included is display-only (how many
    # hours of waiting time are bundled into total_booking_amount before
    # extra waiting charges would apply) - not read by any charge calc.
    total_booking_amount = Column(Integer, nullable=True)
    extra_amount = Column(Integer, nullable=True)
    waiting_hours_included = Column(Integer, nullable=True)
    # Website "Urgent - need taxi immediately" flag, carried over from the
    # CustomerBookingRequest that generated this order (see
    # crud/customer_booking_request.py). Drives the short urgent-track
    # assignment window and lets the app show an URGENT badge.
    is_urgent = Column(Boolean, nullable=False, default=False, server_default='false')
    gst_included = Column(Boolean, nullable=False, default=False, server_default='false')
    gst_amount = Column(Integer, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    
    
