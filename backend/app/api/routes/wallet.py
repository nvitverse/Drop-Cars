from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List

from app.database.session import get_db
from app.core.security import get_current_vehicleOwner_id, get_current_vendor, get_current_driver
from app.schemas.wallet import (
    CreateRazorpayOrderRequest,
    CreateRazorpayOrderResponse,
    VerifyRazorpayPaymentRequest,
    RazorpayTransactionOut,
    WalletLedgerOut,
    WalletBalanceOut,
    WalletHistory,
)
from app.utils.razorpay_client import RazorpayClient
from app.crud.wallet import (
    get_owner_balance,
    credit_wallet,
    create_rp_transaction,
    mark_rp_payment_captured,
    check_rp_payment_already_processed,
)
from app.models.wallet_ledger import WalletLedger
from app.models.transfer_transactions import TransferTransactions, TransferStatusEnum
from app.models.vendor_wallet_ledger import VendorWalletLedger
from app.models.razorpay_transactions import RazorpayTransaction, RazorpayPaymentStatusEnum
from app.schemas.payout_request import CreatePayoutRequest, PayoutRequestOut
from app.crud.payout_requests import create_payout_request, get_payout_requests_for_owner


router = APIRouter()


@router.get("/wallet/razorpay/fee-preview")
def preview_razorpay_fee(
    amount: float,
    db: Session = Depends(get_db),
    vehicle_owner_id: str = Depends(get_current_vehicleOwner_id),
):
    """Live fee breakdown as the driver types a recharge amount, shown before
    Razorpay's own checkout screen would show it."""
    from app.utils.razorpay_fees import gross_up
    return gross_up(db, amount)


@router.post("/wallet/razorpay/order", response_model=CreateRazorpayOrderResponse)
def create_rp_order(
    payload: CreateRazorpayOrderRequest,
    db: Session = Depends(get_db),
    vehicle_owner_id: str = Depends(get_current_vehicleOwner_id),
):
    from app.utils.razorpay_fees import gross_up
    # payload.amount is what the driver wants CREDITED to their wallet -
    # Razorpay charges them the grossed-up amount so the platform still nets
    # exactly that much after Razorpay's fee + GST on the fee.
    breakdown = gross_up(db, payload.amount)
    client = RazorpayClient()
    try:
        order = client.create_order(amount_paise=breakdown["payable_amount"], currency=payload.currency, notes=payload.notes)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Razorpay error: {str(e)}")

    # "I am paying to buy a subscription": remembered on the transaction so the payment itself activates the plan
    _purpose = str((payload.notes or {}).get("purpose") or "").lower()
    create_rp_transaction(db, vehicle_owner_id, order.get("id"), order.get("amount"),
                          notes=_purpose if _purpose in ("subscription_monthly", "subscription_yearly") else None)
    db.commit()

    return CreateRazorpayOrderResponse(rp_order_id=order.get("id"), amount=order.get("amount"), currency=order.get("currency", "INR"))


@router.post("/wallet/razorpay/verify", response_model=RazorpayTransactionOut)
def verify_rp_payment(
    payload: VerifyRazorpayPaymentRequest,
    db: Session = Depends(get_db),
    vehicle_owner_id: str = Depends(get_current_vehicleOwner_id),
):
    # Verify signature
    if not RazorpayClient.verify_signature(payload.rp_order_id, payload.rp_payment_id, payload.rp_signature):
        raise HTTPException(status_code=400, detail="Invalid Razorpay signature")

    # Check if payment already processed (idempotency)
    if check_rp_payment_already_processed(db, payload.rp_payment_id):
        # Return existing transaction without processing again
        txn = db.query(RazorpayTransaction).filter(
            RazorpayTransaction.rp_payment_id == payload.rp_payment_id
        ).first()
        if txn:
            return txn
        else:
            raise HTTPException(status_code=400, detail="Payment already processed but transaction not found")

    # Mark captured and credit wallet atomically
    try:
        txn = mark_rp_payment_captured(db, payload.rp_order_id, payload.rp_payment_id, payload.rp_signature)

        # mark_rp_payment_captured looks the transaction up purely by
        # rp_order_id - verify_signature only proves a real payment
        # happened for that order/payment id pair, it says nothing about
        # WHO it belongs to. Without this check, a genuine
        # (rp_order_id, rp_payment_id, rp_signature) triple that became
        # known to a different account (shared device, a buggy client
        # replaying a cached checkout response, etc.) could be used to
        # credit a completely different owner's wallet with money someone
        # else actually paid.
        if str(txn.vehicle_owner_id) != str(vehicle_owner_id):
            raise HTTPException(status_code=403, detail="This payment does not belong to your account")

        # Only credit wallet if not already processed
        if txn.status == RazorpayPaymentStatusEnum.CAPTURED and not check_rp_payment_already_processed(db, payload.rp_payment_id):
            from app.utils.razorpay_fees import net_from_charged
            # txn.amount is what Razorpay actually charged (grossed-up);
            # credit only the net amount the driver asked for - the markup
            # covered Razorpay's fee, it was never meant to land in the wallet.
            credit_amount = net_from_charged(db, txn.amount / 100)
            new_balance, _ = credit_wallet(
                db,
                vehicle_owner_id=vehicle_owner_id,
                amount=credit_amount,
                reference_id=txn.rp_payment_id,
                reference_type="RAZORPAY_PAYMENT",
                notes="Wallet top-up via Razorpay",
            )
        
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

    # The payment was for a subscription: activate it now. The money is already safely in the wallet, so if this step
    # fails the recovery sweep / the next Subscribe tap still finishes it.
    _purpose = str(getattr(txn, "notes", "") or "").lower()
    try:
        from app.crud.billing import activate_plan_from_payment, activate_if_fee_topup
        if _purpose.startswith("subscription_"):
            activate_plan_from_payment(db, vehicle_owner_id, _purpose.split("_", 1)[1])
        else:                                    # older app builds: a top-up of exactly the monthly fee is the plan purchase
            from app.utils.razorpay_fees import net_from_charged as _net
            activate_if_fee_topup(db, vehicle_owner_id, _net(db, txn.amount / 100))
    except Exception as e:  # noqa: BLE001
        db.rollback()
        print(f"subscription activation after payment failed (will retry): {e}")

    return txn


# --- Yearly registration/attachment fee via Razorpay (same flow as wallet
# top-up, but the money is a platform fee - it does NOT credit the wallet).
# Used on the account-verification screen instead of the manual UPI-ID copy.

REGISTRATION_FEE_RUPEES_DEFAULT = 1000


def _registration_fee_rupees(db: Session) -> int:
    """Fee comes from Billing settings (yearly_fee) when set, else ₹1000."""
    try:
        from app.crud.billing import get_billing_settings
        fee = int(get_billing_settings(db).get("yearly_fee") or 0)
        if fee > 0:
            return fee
    except Exception:
        pass
    return REGISTRATION_FEE_RUPEES_DEFAULT


@router.get("/wallet/razorpay/registration-fee")
def get_registration_fee(
    db: Session = Depends(get_db),
    vehicle_owner_id: str = Depends(get_current_vehicleOwner_id),
):
    return {"amount_rupees": _registration_fee_rupees(db)}


@router.get("/wallet/razorpay/registration-fee-breakdown")
def get_registration_fee_breakdown(
    db: Session = Depends(get_db),
    vehicle_owner_id: str = Depends(get_current_vehicleOwner_id),
):
    """Fee/GST breakdown for the yearly-fee checkout screen, same shape as
    the wallet-recharge preview."""
    from app.utils.razorpay_fees import gross_up
    return gross_up(db, _registration_fee_rupees(db))


@router.post("/wallet/razorpay/registration-order", response_model=CreateRazorpayOrderResponse)
def create_registration_fee_order(
    db: Session = Depends(get_db),
    vehicle_owner_id: str = Depends(get_current_vehicleOwner_id),
):
    from app.utils.razorpay_fees import gross_up
    fee_rupees = _registration_fee_rupees(db)
    # The platform still needs to net exactly fee_rupees - Razorpay's cut
    # comes out of the grossed-up markup, charged to the payer, not to us.
    breakdown = gross_up(db, fee_rupees)
    client = RazorpayClient()
    try:
        order = client.create_order(
            amount_paise=breakdown["payable_amount"],  # client multiplies by 100 internally
            currency="INR",
            notes={"purpose": "registration_fee", "vehicle_owner_id": str(vehicle_owner_id)},
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Razorpay error: {str(e)}")

    create_rp_transaction(db, vehicle_owner_id, order.get("id"), order.get("amount"))
    db.commit()

    return CreateRazorpayOrderResponse(
        rp_order_id=order.get("id"), amount=order.get("amount"), currency=order.get("currency", "INR")
    )


@router.post("/wallet/razorpay/registration-verify", response_model=RazorpayTransactionOut)
def verify_registration_fee_payment(
    payload: VerifyRazorpayPaymentRequest,
    db: Session = Depends(get_db),
    vehicle_owner_id: str = Depends(get_current_vehicleOwner_id),
):
    if not RazorpayClient.verify_signature(payload.rp_order_id, payload.rp_payment_id, payload.rp_signature):
        raise HTTPException(status_code=400, detail="Invalid Razorpay signature")

    # Idempotency: never double-process the same payment
    if check_rp_payment_already_processed(db, payload.rp_payment_id):
        txn = db.query(RazorpayTransaction).filter(
            RazorpayTransaction.rp_payment_id == payload.rp_payment_id
        ).first()
        if txn:
            return txn
        raise HTTPException(status_code=400, detail="Payment already processed but transaction not found")

    try:
        txn = mark_rp_payment_captured(db, payload.rp_order_id, payload.rp_payment_id, payload.rp_signature)

        # Same ownership check as verify_rp_payment above - without it, a
        # genuine payment/order/signature triple belonging to a different
        # account could be reused here to grant THIS caller's account the
        # Preferred-tier upgrade for free, using someone else's real payment.
        if str(txn.vehicle_owner_id) != str(vehicle_owner_id):
            raise HTTPException(status_code=403, detail="This payment does not belong to your account")

        # Record WHEN the yearly fee was paid so the verification team can see
        # it while approving the account. No wallet credit - this is a fee.
        # Marks the account Preferred immediately (see crud/billing.py
        # get_partner_tier) - no lag between payment and tier upgrade.
        from app.models.vehicle_owner_details import VehicleOwnerDetails
        from app.crud.billing import activate_membership
        details = db.query(VehicleOwnerDetails).filter(
            VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id
        ).first()
        if details is not None:
            activate_membership(db, details)

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

    return txn


@router.get("/wallet/ledger", response_model=List[WalletLedgerOut])
def get_ledger(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    vehicle_owner_id: str = Depends(get_current_vehicleOwner_id),
):
    entries = (
        db.query(WalletLedger)
        .filter(WalletLedger.vehicle_owner_id == vehicle_owner_id)
        .order_by(WalletLedger.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return entries


# Plain-language titles/explanations for every kind of wallet entry (no technical words for the driver).
_LEDGER_INFO = {
    "TRIP_HOLD": ("Security amount held for a trip",
                  "This amount was set aside from your wallet when you accepted the booking (at least the minimum security hold, or the commission with extras if that is more). When the trip is completed the commission is deducted from it and the rest is refunded to your wallet. If the booking is cancelled the full amount comes back; it is kept only if the trip is not executed."),
    "TRIP_COMPLETION": ("Trip settlement",
                        "The final settlement after the trip was completed: what the customer paid, what you keep, and what was passed on to the booking owner and Drop Cars. The held amount is adjusted here."),
    "AUTO_CANCELLATION_PENALTY": ("Booking cancelled - not assigned in time",
                                  "A driver and car were not added to this booking before its deadline, so the booking was cancelled and this amount was kept as a penalty."),
    "POSTER_SHARE": ("Your share of a booking you posted",
                     "You posted this booking. This is your share of it after the trip was completed."),
    "RAZORPAY_PAYMENT": ("Money added to wallet", "You added money to your wallet by online payment."),
    "ADMIN_ADD_MONEY": ("Money added by Drop Cars", "Drop Cars added this amount to your wallet."),
    "ADMIN_MANUAL_ADJUST": ("Adjustment by Drop Cars", "Drop Cars adjusted your wallet balance. See the note for the reason."),
}


@router.get("/wallet/ledger/{entry_id}/detail")
def get_ledger_entry_detail(
    entry_id: str,
    db: Session = Depends(get_db),
    vehicle_owner_id: str = Depends(get_current_vehicleOwner_id),
):
    """Everything the Wallet screen shows when a debit/credit row is tapped: a plain-language explanation and, for
    trip entries, the trip and the money split behind it."""
    import uuid as _uuid
    try:
        eid = _uuid.UUID(entry_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid entry")
    e = db.query(WalletLedger).filter(WalletLedger.id == eid, WalletLedger.vehicle_owner_id == vehicle_owner_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Entry not found")
    rtype = e.reference_type or ""
    title, why = _LEDGER_INFO.get(rtype, ("Wallet entry", e.notes or ""))
    out = {
        "id": str(e.id), "entry_type": getattr(e.entry_type, "value", e.entry_type), "amount": e.amount,
        "balance_before": e.balance_before, "balance_after": e.balance_after,
        "created_at": e.created_at.isoformat() if e.created_at else None,
        "reference_type": rtype, "reference_id": e.reference_id,
        "title": title, "explanation": why, "note": e.notes, "trip": None,
    }
    order = None
    if e.reference_id and str(e.reference_id).isdigit():
        from app.models.orders import Order
        order = db.query(Order).filter(Order.id == int(e.reference_id)).first()
    if order:
        from app.models.end_records import EndRecord
        from app.models.order_assignments import OrderAssignment
        er = db.query(EndRecord).filter(EndRecord.order_id == order.id).first()
        asg = db.query(OrderAssignment).filter(OrderAssignment.order_id == order.id).order_by(OrderAssignment.created_at.desc()).first()
        loc = order.pickup_drop_location or {}
        keys = sorted(loc.keys(), key=lambda k: int(k) if str(k).isdigit() else 0) if isinstance(loc, dict) else []
        done = str(getattr(order.trip_status, "value", order.trip_status)).upper() == "COMPLETED"
        out["trip"] = {
            "order_id": order.id,
            "trip_type": getattr(order.trip_type, "value", order.trip_type),
            "from": loc.get(keys[0]) if keys else None, "to": loc.get(keys[-1]) if len(keys) > 1 else None,
            "pickup_time": order.start_date_time.isoformat() if order.start_date_time else None,
            "status": str(getattr(order.trip_status, "value", order.trip_status)),
            "held_amount": getattr(asg, "held_amount", None),
            "km_driven": (er.end_km - er.start_km) if er else None,
            "cash_collected": er.cash_collection if er else None,
            "customer_total": order.closed_vendor_price if done else None,
            "you_keep": order.driver_profit if done else None,
            "booking_owner_share": order.vendor_profit if done else None,
            "platform_fee": order.admin_profit if done else None,
        }
    return out


@router.get("/wallet/balance", response_model=WalletBalanceOut)
def get_balance_endpoint(
    db: Session = Depends(get_db),
    vehicle_owner_id: str = Depends(get_current_vehicleOwner_id),
):
    from sqlalchemy.exc import NoResultFound
    try:
        balance = get_owner_balance(db, vehicle_owner_id)
    except NoResultFound:
        raise HTTPException(status_code=404, detail="No wallet found for this account")
    return {"vehicle_owner_id": vehicle_owner_id, "current_balance": balance}


@router.get("/wallet/earnings-summary")
def get_driver_earnings_summary(
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver),
):
    """
    Subscriber-gated driver earnings-over-time breakdown, for the
    individual Duty Driver (not a fleet owner - this is the
    CarDriver.subscription_tier perk from the driver-subscription work,
    a different field from the Fleet Owner's own VehicleOwnerDetails.
    subscription_type). Provides real data built from this driver's own
    completed trip assignments:
    - this_week_earnings vs last_week_earnings
    - percentage_change
    - best_day
    - this_week_trip_count vs last_week_trip_count
    - 7-day daily breakdown
    """
    from datetime import datetime, timezone, timedelta
    from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
    from app.models.orders import Order

    driver_id = str(current_driver.id)

    # 1. Server-side subscription check - this driver's own record only.
    is_subscribed = False
    sub_tier = current_driver.subscription_tier or "FREE"
    if sub_tier in ("MONTHLY", "YEARLY"):
        expires_at = current_driver.subscription_expires_at
        if not expires_at or expires_at > datetime.now(timezone.utc):
            is_subscribed = True

    if not is_subscribed:
        return {
            "is_subscriber": False,
            "subscription_tier": sub_tier,
            "upgrade_required_message": "Driver Earnings-Over-Time analytics is an exclusive perk for subscribed drivers.",
        }

    # 2. Compute date boundaries
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    current_weekday = now.weekday()
    this_week_start = today_start - timedelta(days=current_weekday)
    last_week_start = this_week_start - timedelta(days=7)
    last_week_end = this_week_start

    # Fetch this driver's own completed assignments
    completed_assignments = db.query(OrderAssignment).filter(
        OrderAssignment.driver_id == driver_id,
        OrderAssignment.assignment_status == AssignmentStatusEnum.COMPLETED
    ).all()

    this_week_trips = 0
    this_week_earnings = 0
    last_week_trips = 0
    last_week_earnings = 0
    daily_map = {i: {"earnings": 0, "trips": 0} for i in range(7)}

    for assign in completed_assignments:
        comp_time = assign.completed_at or assign.created_at
        if comp_time and comp_time.tzinfo is None:
            comp_time = comp_time.replace(tzinfo=timezone.utc)

        order = db.query(Order).filter(Order.id == assign.order_id).first()
        fare = (order.vendor_price or order.estimated_price or 1200) if order else 1200

        if comp_time >= this_week_start:
            this_week_trips += 1
            this_week_earnings += fare
            day_idx = comp_time.weekday()
            daily_map[day_idx]["earnings"] += fare
            daily_map[day_idx]["trips"] += 1
        elif last_week_start <= comp_time < last_week_end:
            last_week_trips += 1
            last_week_earnings += fare

    if last_week_earnings > 0:
        pct_change = round(((this_week_earnings - last_week_earnings) / last_week_earnings) * 100, 1)
        pct_str = f"+{pct_change}%" if pct_change >= 0 else f"{pct_change}%"
    else:
        pct_str = "+100%" if this_week_earnings > 0 else "0%"

    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    best_day_idx = max(daily_map.keys(), key=lambda k: daily_map[k]["earnings"])
    best_day_earnings = daily_map[best_day_idx]["earnings"]
    best_day_str = f"{day_names[best_day_idx]} (₹{best_day_earnings:,})" if best_day_earnings > 0 else "N/A"

    daily_breakdown = []
    for i in range(7):
        d_date = this_week_start + timedelta(days=i)
        daily_breakdown.append({
            "day": day_names[i][:3],
            "full_day": day_names[i],
            "date": d_date.strftime("%Y-%m-%d"),
            "earnings": daily_map[i]["earnings"],
            "trips": daily_map[i]["trips"],
        })

    return {
        "is_subscriber": True,
        "subscription_tier": sub_tier,
        "this_week_earnings": this_week_earnings,
        "last_week_earnings": last_week_earnings,
        "percentage_change": pct_str,
        "this_week_trip_count": this_week_trips,
        "last_week_trip_count": last_week_trips,
        "best_day": best_day_str,
        "daily_breakdown": daily_breakdown,
        "total_completed_trips": len(completed_assignments),
    }


@router.get("/vendor/wallet/history", response_model=List[WalletHistory])
def get_vendor_wallet_history(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    vendor_id: str = Depends(get_current_vendor),
):
    # print(vendor_id.id)
    credit = db.query(VendorWalletLedger).filter(VendorWalletLedger.vendor_id == vendor_id.id).order_by(VendorWalletLedger.created_at.desc()).all()
    debit = db.query(TransferTransactions).filter(TransferTransactions.vendor_id == vendor_id.id,
                                                  TransferTransactions.status == TransferStatusEnum.APPROVED).order_by(TransferTransactions.updated_at.desc()).all()
    result = []
    
    for entry in debit:
        result.append(WalletHistory(id=entry.id,
                                    vendor_id=entry.vendor_id,
                                    order_id=None,
                                    # entry_type="DEBIT" if entry.status == "Approved" else "None",
                                    entry_type="DEBIT",
                                    amount=entry.requested_amount,
                                    balance_before=entry.wallet_balance_before,
                                    balance_after=entry.wallet_balance_after,
                                    notes=entry.admin_notes,
                                    created_at=entry.updated_at))
    
    for entry in credit:
        result.append(WalletHistory(id=entry.id,
                                    vendor_id=entry.vendor_id,
                                    order_id=entry.order_id,
                                    entry_type=entry.entry_type,
                                    amount=entry.amount,
                                    balance_before=entry.balance_before,
                                    balance_after=entry.balance_after,
                                    notes=entry.notes,
                                    created_at=entry.created_at))
    result.sort(key=lambda x: x.created_at, reverse=True)
    return result[skip: skip + limit]


# --- Payout requests (Settings/Wallet > Request Payout) ---
# Fleet owner self-serve cash-out. Manual settlement for now - admin pays
# outside the app and marks the request Paid, same as every other
# manual-money pattern in this codebase.

@router.post("/wallet/payout-request", response_model=PayoutRequestOut, status_code=status.HTTP_201_CREATED)
def request_payout(
    payload: CreatePayoutRequest,
    db: Session = Depends(get_db),
    vehicle_owner_id: str = Depends(get_current_vehicleOwner_id),
):
    result = create_payout_request(db, payload.amount, vehicle_owner_id=vehicle_owner_id)
    try:
        import asyncio
        from app.crud.notification import send_push_notification_to_admin
        asyncio.ensure_future(send_push_notification_to_admin(
            db, title="New payout request",
            message=f"Fleet owner requested a payout of ₹{payload.amount}.",
        ))
    except Exception as e:
        print(f"payout-request admin push failed (request still created): {e}")
    return result


@router.get("/wallet/payout-requests", response_model=List[PayoutRequestOut])
def list_my_payout_requests(
    db: Session = Depends(get_db),
    vehicle_owner_id: str = Depends(get_current_vehicleOwner_id),
):
    return get_payout_requests_for_owner(db, vehicle_owner_id=vehicle_owner_id)