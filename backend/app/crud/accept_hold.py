"""The wallet amount a fleet owner must hold to accept a booking - ONE place, used by accept_order and by the
car-substitution approval (which tells the driver how much to recharge before he can accept).
Moved here unchanged from api/routes/order_assignments.py (accept_order)."""


def compute_accept_hold(db, order):
    """Returns (hold_amount, vendor_hold_amount, is_vendor_booking) exactly as accept_order computes them."""
    # Symmetrical Wallet Hold Guarantee System:
    # Commission rate: 2% for Vendor-posted bookings, 15% for Website/Direct/DropBid bookings.
    import math
    is_vendor_booking = bool(getattr(order, "vendor_id", None))
    comm_rate = 0.02 if is_vendor_booking else 0.15

    total_booking = getattr(order, "total_booking_amount", None) or getattr(order, "estimated_price", None) or 0
    extra_amt = getattr(order, "extra_amount", None) or 0
    advance_rec = getattr(order, "advance_received", None) or 0

    admin_comm = math.ceil(total_booking * comm_rate)
    driver_earnings = max(0, total_booking - admin_comm)
    cash_to_collect = max(0, (total_booking + extra_amt) - advance_rec)

    if cash_to_collect > driver_earnings:
        hold_amount = math.ceil((cash_to_collect - driver_earnings) + admin_comm)
        vendor_hold_amount = 0
    else:
        hold_amount = admin_comm
        vendor_hold_amount = math.ceil(driver_earnings - cash_to_collect)

    # Every booking (vendor, driver-posted, website, admin) uses the shared commission split
    # (utils/commission.py) - the same numbers trip close settles with, so the amount held here is
    # exactly what the driver hands over at the end. The old formula above kept counting the cash excess
    # on top of the commission, and used 15% for every booking without a vendor. Vendor bookings and
    # Hourly Rental keep the formula above.
    _src = getattr(getattr(order, "source", None), "value", getattr(order, "source", None))
    if _src != "HOURLY_RENTAL":
        from app.utils.commission import estimate_split_for_order, expected_hold
        _split = estimate_split_for_order(db, order)
        hold_amount = expected_hold(_split, advance_rec)
        # no separate vendor payout hold any more: the vendor's advance already sits in their wallet and the
        # trip-close settlement moves the exact difference (see end_records._settle_trip)
        vendor_hold_amount = 0
    else:
        # Hourly Rental keeps the formula above, plus the convenience fee: the driver collects it from the
        # customer in cash and it is settled to the platform out of his wallet at trip close (end_records.py)
        from app.utils.commission import convenience_fee_amount, min_hold_amount
        hold_amount += convenience_fee_amount(db)
        hold_amount = max(hold_amount, min_hold_amount(db))      # the minimum hold applies to every booking


    return hold_amount, vendor_hold_amount, is_vendor_booking
