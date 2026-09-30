# models/customer_booking_request.py
from sqlalchemy import Column, String, TIMESTAMP, Integer, func, JSON, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database.session import Base

class CustomerBookingRequest(Base):
    __tablename__ = "customer_booking_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customer.id"), nullable=False)
    pickup_drop_location = Column(JSON, nullable=False)
    trip_type = Column(String, nullable=False)  # "Oneway" | "Round Trip" | "Hourly Rental" | "Multy City"
    car_type = Column(String, nullable=False)   # e.g. HATCHBACK, SEDAN_4_PLUS_1, etc.
    start_date_time = Column(TIMESTAMP(timezone=True), nullable=False)
    customer_name = Column(String, nullable=False)
    customer_number = Column(String, nullable=False)
    # Required for the live status webhook + driver-assigned notification
    # email back to the website (see app/utils/website_status_webhook.py).
    # Nullable here for old rows / non-website sources; the website itself
    # enforces it as mandatory at booking-confirm time.
    customer_email = Column(String, nullable=True)
    
    # Quoted fare fields (system quote at booking time)
    quoted_cost_per_km = Column(Integer, nullable=False)
    quoted_driver_allowance = Column(Integer, nullable=False)
    quoted_extra_driver_allowance = Column(Integer, nullable=False)
    quoted_permit_charges = Column(Integer, nullable=False)
    quoted_extra_permit_charges = Column(Integer, nullable=False)
    quoted_hill_charges = Column(Integer, nullable=False)
    quoted_toll_charges = Column(Integer, nullable=False)
    quoted_extra_cost_per_km = Column(Integer, nullable=False)
    quoted_night_charges = Column(Integer, nullable=False)
    quoted_total_amount = Column(Integer, nullable=False)
    quoted_driver_amount = Column(Integer, nullable=False)
    quoted_trip_distance = Column(Integer, nullable=False)
    quoted_trip_time = Column(String, nullable=False)

    # Admin-edited fare fields (filled at approval time)
    admin_cost_per_km = Column(Integer, nullable=True)
    admin_driver_allowance = Column(Integer, nullable=True)
    admin_extra_driver_allowance = Column(Integer, nullable=True)
    admin_permit_charges = Column(Integer, nullable=True)
    admin_extra_permit_charges = Column(Integer, nullable=True)
    admin_hill_charges = Column(Integer, nullable=True)
    admin_toll_charges = Column(Integer, nullable=True)
    admin_extra_cost_per_km = Column(Integer, nullable=True)
    admin_night_charges = Column(Integer, nullable=True)
    admin_total_amount = Column(Integer, nullable=True)
    admin_driver_amount = Column(Integer, nullable=True)

    status = Column(String, nullable=False, default="PENDING")  # "PENDING" | "ACCEPTED" | "APPROVED" | "REJECTED"
    rejection_reason = Column(String, nullable=True)
    linked_order_id = Column(Integer, nullable=True)  # References orders.id

    # Website "Urgent - need taxi immediately" flag. Drives which admin-review
    # timer applies (short urgent window vs the normal one) - see
    # crud/customer_booking_request.py:get_auto_approve_seconds.
    is_urgent = Column(Boolean, nullable=False, default=False, server_default="false")

    # Soft leads (website enquiries, not a real committed booking) must
    # NEVER auto-post to the driver marketplace on a timer the way a real
    # confirmed booking does - only an explicit confirm (website, admin
    # panel, or Admin App) should move it forward. See
    # auto_approve_expired_booking_requests(), which skips any row where
    # this is true.
    requires_manual_confirm = Column(Boolean, nullable=False, default=False, server_default="false")

    # Website customer-initiated cancel: short-lived OTP emailed to the
    # customer to prove it's really them before a cancel is honoured (a
    # booking ID alone isn't proof of identity - see
    # app/api/routes/website_bookings.py's request-cancel-otp/confirm-cancel
    # endpoints). Regenerated fresh on every cancel attempt.
    cancel_otp = Column(String, nullable=True)
    cancel_otp_expires_at = Column(TIMESTAMP(timezone=True), nullable=True)

    # Set once, at cancel time, from cancel_order_by_customer's refund-tier
    # result (see crud/order_assignments.py) - whether this specific
    # cancellation happened before or after driver+car assignment. Drives
    # whether "Request Refund" is even offered.
    refund_eligible = Column(Boolean, nullable=True)
    # Deliberately NOT auto-processed via Razorpay - customer requests it,
    # admin reviews and processes it manually (see
    # app/api/routes/website_bookings.py's request-refund/process-refund
    # endpoints). "1-5 working days" is shown to the customer the moment
    # they request it, regardless of how long admin actually takes.
    refund_status = Column(String, nullable=True)  # None | "REQUESTED" | "PROCESSED" | "DENIED"
    refund_requested_at = Column(TIMESTAMP(timezone=True), nullable=True)
    refund_processed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    refund_amount = Column(Integer, nullable=True)
    refund_notes = Column(String, nullable=True)

    # Where this request came from ("APP" | "WEBSITE"). Lets auto-approval and
    # reporting distinguish website-originated bookings from the Customer App.
    source = Column(String, nullable=False, default="APP", server_default="APP")
    # Which website integration posted this (see models/website_integration.py).
    # Null for APP-sourced rows and for WEBSITE rows authenticated via the
    # legacy single env-var key rather than a registered integration row.
    source_website_id = Column(UUID(as_uuid=True), ForeignKey("website_integrations.id"), nullable=True)
    # Who/what approved or rejected it ("ADMIN" | "AUTO_TIMEOUT")
    decided_by = Column(String, nullable=True)

    # A driver's own referral code (VehicleOwnerDetails.referral_code),
    # entered by the CUSTOMER at booking time - not the existing owner-refers-
    # owner signup flow. If this trip completes, the code's owner gets a
    # bonus (see crud/referrals.py:credit_customer_referral_bonus_if_eligible,
    # called from crud/end_records.py). Paid at most once per (driver,
    # customer) pair regardless of how many times that pair is reused -
    # enforced by checking this customer's past rows for the same code with
    # referral_bonus_credited=True before crediting a new one.
    driver_referral_code = Column(String, nullable=True)
    referral_bonus_credited = Column(Boolean, nullable=False, default=False, server_default="false")

    # Razorpay Payment tracking
    is_paid = Column(Boolean, nullable=False, default=False)
    rp_order_id = Column(String, nullable=True)
    rp_payment_id = Column(String, nullable=True)
    rp_signature = Column(String, nullable=True)
    # The rupee amount actually charged for the advance (website computes this
    # as 15% of the fare and charges it via Razorpay before this request is
    # even created - see website's assets/js/booking-form.js). Without this,
    # a verified, real advance payment had no way to reach NewOrder.advance_received
    # at approval time - Driver/Vendor/Admin apps showed 0 advance collected
    # even when a customer had genuinely paid one.
    advance_amount = Column(Integer, nullable=True)

    # GST configuration
    gst_included = Column(Boolean, nullable=False, default=False, server_default="false")
    gst_amount = Column(Integer, nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    decided_at = Column(TIMESTAMP(timezone=True), nullable=True)
