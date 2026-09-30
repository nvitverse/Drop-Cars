# models/drop_bid.py
"""
Drop Bid - reverse-auction negotiation. A customer posts their own target
price for a trip; any number of fleet owners/drivers can submit a
competing offer (own car+driver, own price); the customer accepts one,
which converts into a real Order exactly like a normal booking (see
crud/drop_bid.py's accept_drop_bid_offer). Was previously a Driver App UI
mock with zero backend - this is the real implementation.
"""
from sqlalchemy import Column, String, Integer, Boolean, TIMESTAMP, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database.session import Base


class DropBidRequest(Base):
    __tablename__ = "drop_bid_requests"

    id = Column(String, primary_key=True, default=lambda: f"bid_{uuid.uuid4().hex[:12]}", nullable=False)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customer.id"), nullable=False, index=True)
    customer_name = Column(String, nullable=False)
    customer_number = Column(String, nullable=False)

    pickup_location = Column(String, nullable=False)
    drop_location = Column(String, nullable=False)
    trip_type = Column(String, nullable=False, default="Oneway")
    car_type = Column(String, nullable=False)
    start_date_time = Column(TIMESTAMP(timezone=True), nullable=False)
    estimated_distance = Column(Integer, nullable=True)

    customer_target_price = Column(Integer, nullable=False)

    # OPEN -> ACCEPTED (one offer won, converted to a real order) or
    # CANCELLED (customer withdrew) or EXPIRED (past start_date_time,
    # never accepted - see crud/drop_bid.py's expiry sweep).
    status = Column(String, nullable=False, default="OPEN", index=True)
    accepted_offer_id = Column(String, nullable=True)
    # Set once accepted - the real Order this negotiation became.
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


class DropBidOffer(Base):
    __tablename__ = "drop_bid_offers"

    id = Column(String, primary_key=True, default=lambda: f"offer_{uuid.uuid4().hex[:12]}", nullable=False)
    request_id = Column(String, ForeignKey("drop_bid_requests.id"), nullable=False, index=True)

    driver_id = Column(UUID(as_uuid=True), ForeignKey("car_driver.id"), nullable=False)
    vehicle_owner_id = Column(UUID(as_uuid=True), ForeignKey("vehicle_owner.id"), nullable=False)
    car_id = Column(UUID(as_uuid=True), ForeignKey("car_details.id"), nullable=False)

    offer_price = Column(Integer, nullable=False)
    # PENDING -> ACCEPTED (this one won) or DECLINED (customer picked a
    # different offer, or withdrew their own bid).
    status = Column(String, nullable=False, default="PENDING", index=True)

    # Counter-offer negotiation (added 2026-09-04) - a pending proposed
    # price from whichever side didn't just move, and who proposed it.
    # counter_by is None when there's no open counter to respond to.
    # Accepting a counter copies counter_price into offer_price and clears
    # both fields - offer_price is always "the price on the table right
    # now", whether that came from the original bid or a later counter.
    counter_price = Column(Integer, nullable=True)
    counter_by = Column(String, nullable=True)  # 'customer' | 'driver'

    # Real advance payment via Razorpay (added 2026-09-04) - same
    # create-order/verify-signature pattern as customer_bookings.py's
    # /customer/bookings/{id}/pay+verify. accept_drop_bid_offer now
    # requires advance_paid=True before it will convert this offer into a
    # real Order - see app/utils/razorpay_client.py.
    advance_amount = Column(Integer, nullable=True)
    advance_rp_order_id = Column(String, nullable=True)
    advance_rp_payment_id = Column(String, nullable=True)
    advance_rp_signature = Column(String, nullable=True)
    advance_paid = Column(Boolean, nullable=False, default=False)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
