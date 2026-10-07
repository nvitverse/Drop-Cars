from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID
from app.models.order_assignments import AssignmentStatusEnum
from app.schemas.new_orders import ChargeItem


class VendorBasicInfo(BaseModel):
    """Basic vendor information for order details"""
    id: UUID
    reg_id: Optional[str] = None
    full_name: str
    primary_number: str
    secondary_number: Optional[str] = None
    gpay_number: str
    aadhar_number: str
    address: str
    wallet_balance: int
    bank_balance: int
    created_at: datetime

    class Config:
        from_attributes = True


class DriverBasicInfo(BaseModel):
    """Basic driver information for order details"""
    id: UUID
    reg_id: Optional[str] = None
    full_name: str
    primary_number: str
    secondary_number: Optional[str] = None
    licence_number: str
    address: str
    driver_status: str
    created_at: datetime

    class Config:
        from_attributes = True


class CarBasicInfo(BaseModel):
    """Basic car information for order details"""
    id: UUID
    car_name: str
    car_type: str
    car_number: str
    car_status: str
    rc_front_img_url: Optional[str] = None
    rc_back_img_url: Optional[str] = None
    insurance_img_url: Optional[str] = None
    fc_img_url: Optional[str] = None
    car_img_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class VehicleOwnerBasicInfo(BaseModel):
    """Basic fleet owner information for order details"""
    id: UUID
    reg_id: Optional[str] = None
    full_name: str
    primary_number: str
    secondary_number: Optional[str] = None
    address: str
    account_status: str
    created_at: datetime

    class Config:
        from_attributes = True


class OrderAssignmentDetail(BaseModel):
    """Order assignment details"""
    id: int
    order_id: int
    vehicle_owner_id: Optional[UUID] = None
    driver_id: Optional[UUID] = None
    car_id: Optional[UUID] = None
    assignment_status: AssignmentStatusEnum
    assigned_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    held_amount: Optional[int] = None
    assigned_by: Optional[str] = "SELF"
    start_trip_otp: Optional[str] = None
    end_trip_otp: Optional[str] = None
    trip_link_url: Optional[str] = None

    class Config:
        from_attributes = True


class EndRecordDetail(BaseModel):
    """End record details"""
    id: int
    order_id: int
    driver_id: Optional[UUID] = None
    start_km: Optional[int] = None
    end_km: Optional[int] = None
    contact_number: Optional[str] = None
    img_url: Optional[str] = None
    close_speedometer_image: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AdminOrderDetailResponse(BaseModel):
    """Full order details response for admin - includes all related data"""
    # Order basic information
    id: int
    source: str
    source_order_id: Optional[int] = None
    vendor_id: Optional[UUID] = None
    trip_type: Optional[str] = None
    car_type: Optional[str] = None
    pickup_drop_location: Optional[Dict[str, Any]] = None
    start_date_time: Optional[datetime] = None
    customer_name: Optional[str] = None
    customer_number: Optional[str] = None
    trip_status: Optional[str] = None
    # Raw cancellation reason - see crud/order_details.py::_display_trip_status
    # for how trip_status derives EXPIRED/AUTOCANCELLED from this.
    cancelled_by: Optional[str] = None
    pick_near_city: Optional[List[str]] = None
    trip_distance: Optional[int] = None
    trip_time: Optional[str] = None
    # Quote-review distance override flag - true when the vendor edited the
    # calculated km/time before confirming. calculated_trip_distance keeps
    # the original Maps/cache figure for comparison.
    distance_edited: bool = False
    calculated_trip_distance: Optional[int] = None
    # Per-stop address/maps link, keyed like pickup_drop_location.
    location_links: Optional[Dict[str, str]] = None
    estimated_price: Optional[int] = None
    vendor_price: Optional[int] = None
    platform_fees_percent: Optional[int] = None
    vendor_fees_percent: Optional[int] = None
    closed_vendor_price: Optional[int] = None
    closed_driver_price: Optional[int] = None
    commision_amount: Optional[int] = None
    # Final profit split, set once the trip is completed and settled - see
    # crud/end_records.py. Distinct from commision_amount, which is the
    # platform's cut; these three together are the full breakdown of who
    # got what out of closed_vendor_price.
    vendor_profit: Optional[int] = None
    driver_profit: Optional[int] = None
    admin_profit: Optional[int] = None
    # Pre-completion ESTIMATE of the same split, using the real commission
    # formula (see crud/order_details.py::_estimate_pretrip_split) - shown
    # in "Quoted (before trip)" while vendor_profit/driver_profit are still
    # None. Only populated for per-km bookings (None for Hourly Rental).
    estimated_vendor_profit: Optional[int] = None
    estimated_driver_profit: Optional[int] = None
    # Included/excluded charge breakdown - e.g. [{"label": "Toll", "included": false}].
    # Display-only, doesn't change how any charge is actually calculated.
    fare_type: Optional[str] = None
    charge_items: Optional[List[ChargeItem]] = None
    advance_received: Optional[int] = None
    night_charges: Optional[int] = None
    waiting_time: Optional[int] = None
    toll_charge_update: bool = False
    updated_toll_charges: Optional[int] = None
    # Per-km rate breakdown as originally quoted by the vendor - only
    # present for standard (NEW_ORDERS) bookings, None for Hourly Rental.
    cost_per_km: Optional[int] = None
    extra_cost_per_km: Optional[int] = None
    driver_allowance: Optional[int] = None
    extra_driver_allowance: Optional[int] = None
    permit_charges: Optional[int] = None
    extra_permit_charges: Optional[int] = None
    hill_charges: Optional[int] = None
    quoted_toll_charges: Optional[int] = None
    # Which platform/app the booking was actually executed on - auto-stamped
    # "Drop Cars App" at creation, admin-editable for manually-logged
    # bookings actually fulfilled through a different channel/partner.
    executed_platform: str = "Drop Cars App"
    created_at: datetime

    # Related data
    # Optional: a growing share of orders are genuinely vendor-less
    # (website-direct bookings, Drop Bid, Driver App "Create Booking") -
    # these were being silently dropped from every admin listing entirely
    # (see get_all_admin_orders' old `if not vendor: continue`) because
    # this field used to be required back when every order had a vendor.
    # Fixed 2026-09-04.
    vendor: Optional[VendorBasicInfo] = None
    assignments: List[OrderAssignmentDetail] = []
    end_records: List[EndRecordDetail] = []
    
    # Driver and car info from latest assignment
    assigned_driver: Optional[DriverBasicInfo] = None
    assigned_car: Optional[CarBasicInfo] = None
    vehicle_owner: Optional[VehicleOwnerBasicInfo] = None
    start_otp: Optional[str] = None
    end_otp: Optional[str] = None

    class Config:
        from_attributes = True


class VendorOrderDetailResponse(BaseModel):
    """Limited order details response for vendor - excludes sensitive user data"""
    # Order basic information
    id: int
    source: str
    source_order_id: int
    # Trip OTPs to share with the customer - see crud/order_details.py's
    # get_vendor_order_details for which codes are returned.
    start_trip_otp: Optional[str] = None
    end_trip_otp: Optional[str] = None
    # Was required UUID - made Optional 2026-09-04 (full schema-vs-model
    # audit) to match AdminOrderDetailResponse's sibling fix earlier this
    # session, even though this endpoint is vendor-scoped (a vendor only
    # ever looks up their own orders in practice, so vendor_id should
    # always be set here) - cheap safety net, no downside.
    vendor_id: Optional[UUID] = None
    trip_type: str
    car_type: str
    pickup_drop_location: Dict[str, Any]
    start_date_time: datetime
    customer_name: str
    customer_number: str
    trip_status: Optional[str] = None
    pick_near_city: Optional[List[str]] = None
    trip_distance: Optional[int] = None
    trip_time: Optional[str] = None
    estimated_price: Optional[int] = None
    vendor_price: Optional[int] = None
    platform_fees_percent: Optional[int] = None
    closed_vendor_price: Optional[int] = None
    closed_driver_price: Optional[int] = None
    commision_amount: Optional[int] = None
    created_at: datetime
    cancelled_by: Optional[str] = None
    max_time_to_assign_order: Optional[datetime] = None
    max_time: Optional[int] = None
    toll_charge_update: Optional[bool] = None
    data_visibility_vehicle_owner: Optional[bool] = None
    updated_toll_charges: Optional[int] = None
    # How the money splits (Admin App booking detail): class + who gets what, estimated until the trip is completed
    commission_class: Optional[str] = None
    commission_breakdown: Optional[Dict[str, Any]] = None

    # Source-specific details for NEW_ORDERS
    cost_per_km: Optional[int] = None
    extra_cost_per_km: Optional[int] = None
    driver_allowance: Optional[int] = None
    extra_driver_allowance: Optional[int] = None
    permit_charges: Optional[int] = None
    extra_permit_charges: Optional[int] = None
    hill_charges: Optional[int] = None
    toll_charges: Optional[int] = None
    night_charges: Optional[int] = None
    waiting_time: Optional[int] = None
    waiting_minutes: Optional[int] = None
    # How the final bill was worked out (crud/end_records.py build_closing_breakdown); rebuilt for trips closed before it was stored
    closing_breakdown: Optional[Dict[str, Any]] = None
    pickup_notes: Optional[str] = None

    # Source-specific details for HOURLY_RENTAL
    package_hours: Optional[Dict[str, Any]] = None
    cost_per_hour: Optional[int] = None
    extra_cost_per_hour: Optional[int] = None
    cost_for_addon_km: Optional[int] = None
    extra_cost_for_addon_km: Optional[int] = None
    vendor_earns_estimation: Optional[int] = None

    # Limited assignment info (no sensitive user data)
    assignments: List[OrderAssignmentDetail] = []
    end_records: List[EndRecordDetail] = []
    
    # Basic driver and car info (no personal details)
    assigned_driver_name: Optional[str] = None
    assigned_driver_phone: Optional[str] = None
    assigned_car_name: Optional[str] = None
    assigned_car_number: Optional[str] = None
    vehicle_owner_name: Optional[str] = None
    vendor_profit: Optional[int] = None
    admin_profit: Optional[int] = None
    vehicle_owner_number: Optional[str] = None
    
    

    class Config:
        from_attributes = True


class VehicleOwnerOrderDetailResponse(BaseModel):
    customer_number_notice: Optional[str] = None
    """Order details response for fleet owner - includes order and assignment information"""
    # Order basic information
    id: int
    source: str
    source_order_id: int
    # Was required UUID - genuinely nullable (vendor-less orders: website-
    # direct bookings posted to the open market are the realistic case
    # here, since Drop Bid/driver-created bookings go straight to ASSIGNED
    # rather than sitting PENDING for other fleet owners). Found
    # 2026-09-04 in a full schema-vs-model audit - this is the exact
    # sibling schema flagged as deliberately deferred earlier this session
    # when AdminOrderDetailResponse got the same fix; completing it now.
    vendor_id: Optional[UUID] = None
    trip_type: str
    car_type: str
    pickup_drop_location: Dict[str, Any]
    start_date_time: datetime
    customer_name: str
    customer_number: str
    trip_status: Optional[str] = None
    pick_near_city: Optional[List[str]] = None
    trip_distance: Optional[int] = None
    trip_time: Optional[str] = None
    estimated_price: Optional[int] = None
    vendor_price: Optional[int] = None
    platform_fees_percent: Optional[int] = None
    closed_vendor_price: Optional[int] = None
    closed_driver_price: Optional[int] = None
    commision_amount: Optional[int] = None
    created_at: datetime
    cancelled_by : Optional[str] = None
    # Per-assignment reason (see OrderAssignment.cancel_reason) - unlike
    # cancelled_by above (the order's own final fate), this is set even when
    # the order was reposted to other fleet owners instead of fully
    # cancelled, so THIS owner's Executed tab can still show why their own
    # assignment ended.
    assignment_cancel_reason : Optional[str] = None
    # Reason text given by whoever cancelled/removed (shown to the driver), and which
    # "Unallocated" bucket a penalised ending belongs to: AUTO_CANCELLED | DITCHED | REMOVED | None
    cancel_note : Optional[str] = None
    unallocated_kind : Optional[str] = None
    # Trip record for completed trips (odometer photos, km, cash) - viewable by the accepting driver
    end_record : Optional[Dict[str, Any]] = None
    data_visibility_vehicle_owner : Optional[bool] = None
    max_time_to_assign_order : Optional[datetime] = None
    pickup_notes : Optional[str] = None
    advance_received: Optional[int] = None
    # Booking type + what is / isn't included (shown on every booking card)
    fare_type: Optional[str] = None
    charge_items: Optional[List[Dict[str, Any]]] = None
    is_drop_bid: Optional[bool] = False
    # Final money of a COMPLETED trip (from what the duty driver actually recorded at trip end)
    final_driver_earnings: Optional[int] = None
    final_poster_share: Optional[int] = None
    final_platform_fee: Optional[int] = None
    held_amount: Optional[int] = None
    is_urgent: Optional[bool] = None
    # Trip-integrity codes (see OrderAssignmentDetail above for why these are
    # surfaced to the vendor - vendor-posted bookings have no customer app
    # account for the codes to be emailed to automatically).
    start_trip_otp: Optional[str] = None
    end_trip_otp: Optional[str] = None
    trip_link_url: Optional[str] = None

    # Pricing fields for frontend display
    price_per_km: Optional[int] = None
    driver_allowance: Optional[int] = None
    permit_charge: Optional[int] = None
    hills_charge: Optional[int] = None
    toll_charge: Optional[int] = None
    waiting_charge: Optional[int] = None
    night_charges: Optional[int] = None
    charges_to_deduct : Optional[int] = None

    # Assignment information for this fleet owner
    assignment_id: int
    assignment_status: AssignmentStatusEnum
    assigned_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    assignment_created_at: datetime

    # Basic vendor info (no sensitive data)
    vendor_name: Optional[str] = None
    vendor_phone: Optional[str] = None

    # Driver and car info if assigned
    assigned_driver_name: Optional[str] = None
    assigned_driver_phone: Optional[str] = None
    assigned_car_name: Optional[str] = None
    assigned_car_number: Optional[str] = None

    class Config:
        from_attributes = True


class AdminOrdersListResponse(BaseModel):
    """Response model for admin orders list with pagination"""
    orders: List[AdminOrderDetailResponse]
    total_count: int
    skip: int
    limit: int

    class Config:
        from_attributes = True