# models/vehicle_owner.py
from sqlalchemy import Column, String, TIMESTAMP, Integer, Date, func, Boolean, Enum as SqlEnum, ForeignKey, JSON, Numeric
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from datetime import date as _date
import uuid
import enum
from app.database.session import Base
from app.models.common_enums import DocumentStatusEnum

class VehicleOwnerDetails(Base):
    __tablename__ = "vehicle_owner_details"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    vehicle_owner_id = Column(UUID(as_uuid=True), ForeignKey("vehicle_owner.id"), nullable=False)
    full_name = Column(String, nullable=False)
    primary_number = Column(String, unique=True, nullable=False)
    secondary_number = Column(String, unique=True, nullable=True)
    wallet_balance = Column(Integer, nullable=False, default=0)
    aadhar_number = Column(String, unique=True, nullable=False)
    aadhar_front_img = Column(String, unique=True, nullable=True)
    aadhar_status = Column(SqlEnum(DocumentStatusEnum, name="document_status_enum"), nullable=True, default=DocumentStatusEnum.PENDING)
    # 'MANUAL' or 'API_AUTO' once set - null means not yet verified either
    # way. See crud/auto_verify.py - the auto-verify API isn't wired yet
    # (no API key), this column just leaves room for it.
    aadhar_verification_source = Column(String, nullable=True)
    # Optional extra KYC documents (added later - both nullable so existing signups are unaffected)
    aadhar_back_img = Column(String, unique=True, nullable=True)
    aadhar_back_status = Column(SqlEnum(DocumentStatusEnum, name="document_status_enum"), nullable=True, default=DocumentStatusEnum.PENDING)
    pan_number = Column(String, nullable=True)
    pan_img = Column(String, unique=True, nullable=True)
    pan_status = Column(SqlEnum(DocumentStatusEnum, name="document_status_enum"), nullable=True, default=DocumentStatusEnum.PENDING)
    # Selfie/profile photo, compared against aadhar_front_img's printed
    # photo for a face-match check (added 2026-09-04, zero-cost - see
    # utils/document_verifier.py's compare_faces).
    profile_img = Column(String, unique=True, nullable=True)
    address = Column(String, nullable=False)
    city = Column(String, nullable=False)
    pincode = Column(String, nullable=False)
    # Vacant City: up to 5 cities where this owner/driver is currently waiting for a trip.
    # Separate from the existing notification-filter cities (that stays a notification filter).
    vacant_cities = Column(ARRAY(String), nullable=True)
    vacant_cities_updated_at = Column(TIMESTAMP(timezone=True), nullable=True)
    vacant_driver_id = Column(String, nullable=True)
    vacant_driver_name = Column(String, nullable=True)
    vacant_car_id = Column(String, nullable=True)
    vacant_car_number = Column(String, nullable=True)
    # Multi-vehicle fleet vacant entries: list of active vacant vehicles for this fleet owner
    # [{"entry_id": "...", "car_id": "...", "car_number": "...", "car_type": "...", "driver_id": "...", "driver_name": "...", "cities": [...], "updated_at": "..."}]
    vacant_fleet_entries = Column(JSON, nullable=True)
    # Fleet Subscriptions screen (manual mark-paid, pause / resume)
    billing_suspended_at = Column(TIMESTAMP(timezone=True), nullable=True)
    billing_suspended_by = Column(String, nullable=True)
    billing_suspended_reason = Column(String, nullable=True)
    subscription_payment_channel = Column(String, nullable=True)
    subscription_payment_ref = Column(String, nullable=True)
    subscription_paid_amount = Column(Numeric(10, 2), nullable=True)
    subscription_paid_at = Column(TIMESTAMP(timezone=True), nullable=True)
    # Yearly-fee billing (all nullable / default so existing rows are unaffected).
    # billing_next_date is NULL until an admin starts the cycle for the account.
    billing_next_date = Column(Date, nullable=True)
    billing_last_charged_at = Column(TIMESTAMP(timezone=True), nullable=True)
    billing_suspended = Column(Boolean, nullable=False, default=False)
    # When the yearly registration/attachment fee was paid via Razorpay
    # (nullable - manual UPI payments won't have it).
    registration_fee_paid_at = Column(TIMESTAMP(timezone=True), nullable=True)
    # Opt-in: when true, the billing sweep auto-debits the wallet for the
    # yearly renewal instead of leaving the account to pay manually via
    # Razorpay/UPI. Off by default - today's sweep auto-debits everyone
    # unconditionally, so this is a behavior change for existing accounts.
    auto_renew_from_wallet = Column(Boolean, nullable=False, default=False)
    # Local Bookings: the one city this owner/driver accepts local trips in.
    # Separate from vacant_cities (outstation "waiting" queue).
    local_city = Column(String, nullable=True)
    # Multi-city version of the above - a driver can now pick several cities,
    # or the literal sentinel ["ALL"] to mean every serviceable city. Kept
    # alongside local_city (not replacing it) so existing single-city rows
    # keep working; local_cities is the new source of truth once set.
    local_cities = Column(ARRAY(String), nullable=True)
    # Billing plan: NULL/'YEARLY' (default, one lump sum/year) or 'MONTHLY'
    # (Rs.199/month, forced wallet auto-debit - cannot be turned off once
    # started, the only way out is upgrading to YEARLY). Both count as
    # Preferred tier while current - see `tier` below.
    subscription_type = Column(String, nullable=True)
    # Referral: this owner's own shareable code (unique) and, if they signed
    # up via someone else's code, who referred them. Bonus is credited to
    # the referrer only after this owner's first COMPLETED trip (see
    # crud/referrals.py) - not at signup, to avoid fake-referral abuse.
    referral_code = Column(String, unique=True, nullable=True)
    referred_by_code = Column(String, nullable=True)
    referral_bonus_credited = Column(Boolean, nullable=False, default=False)
    # Staff-granted Trusted Partner override - independent of the yearly/
    # monthly billing evidence below. Gated to a permitted staff subset (see
    # require_trusted_partner_permission in api/routes/admin.py), because
    # Trusted Partner unlocks posting bookings to the whole driver network
    # and holding customer advances.
    admin_trusted_override = Column(Boolean, nullable=False, default=False, server_default="false")
    trusted_override_by = Column(String, nullable=True)
    trusted_override_reason = Column(String, nullable=True)
    trusted_override_at = Column(TIMESTAMP(timezone=True), nullable=True)
    # Auto-trust window from a driver under this owner paying for the
    # Driver App's own "Pro" monthly/yearly subscription (POST
    # /subscriptions/driver/subscribe) - separate money flow from the
    # yearly registration fee above, but the posting-gate error message has
    # always told drivers "Become a Trusted Partner from Settings >
    # Subscription", so paying there must actually grant it. Lapses on its
    # own once the Pro subscription expires (mirrors subscription_expires_at).
    driver_pro_trusted_until = Column(TIMESTAMP(timezone=True), nullable=True)
    # Payout destination - either bank OR UPI is enough, both nullable/optional.
    bank_account_number = Column(String, nullable=True)
    bank_ifsc = Column(String, nullable=True)
    bank_account_holder_name = Column(String, nullable=True)
    upi_id = Column(String, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    # owner_profile_status = Column(Boolean, nullable=False, default=False)
    # driver_profile = Column(Boolean, nullable=False, default=False)
    # car_profile = Column(Boolean, nullable=False, default=False)

    @property
    def tier(self) -> str:
        """Preferred = paid at least once, not suspended, not past a lapsed
        due date. Everyone else (including never-paid) is Standard. Single
        source of truth - crud/billing.py's get_partner_tier delegates here,
        and this also lets admin list/detail schemas expose it via
        from_attributes without a real column.

        "Paid at least once" is evidenced by EITHER registration_fee_paid_at
        (set on Razorpay payments and most billing-crud paths) OR a
        billing_next_date that's still in the future (set on every payment
        path including manual/admin-adjusted ones that don't stamp
        registration_fee_paid_at) - relying on registration_fee_paid_at
        alone incorrectly stuck genuinely-active paid accounts at STANDARD
        whenever only billing_next_date had been advanced.

        Two more independent paths also grant PREFERRED, checked first so
        billing_suspended/lapsed billing_next_date (which only describe the
        yearly registration fee) can never cancel them out:
        admin_trusted_override (a staff-granted manual flag) and
        driver_pro_trusted_until (earned by paying for the Driver App's own
        Pro subscription - see api/routes/subscriptions.py's subscribe_driver)."""
        if self.admin_trusted_override:
            return "PREFERRED"
        from datetime import datetime as _datetime, timezone as _timezone
        if self.driver_pro_trusted_until is not None and self.driver_pro_trusted_until > _datetime.now(_timezone.utc):
            return "PREFERRED"
        has_paid_evidence = (
            self.registration_fee_paid_at is not None
            or (self.billing_next_date is not None and self.billing_next_date >= _date.today())
        )
        if not has_paid_evidence:
            return "STANDARD"
        if self.billing_suspended:
            return "STANDARD"
        if self.billing_next_date is not None and self.billing_next_date < _date.today():
            return "STANDARD"
        return "PREFERRED"

