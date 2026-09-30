from fastapi import APIRouter, HTTPException, Depends, Body
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone, date
from typing import Optional
from pydantic import BaseModel

from app.database.session import get_db
from app.models.customer_details import CustomerDetails
from app.models.car_driver import CarDriver
from app.models.vehicle_owner_details import VehicleOwnerDetails
from app.core.security import get_current_customer, get_current_driver, get_current_admin
from app.utils.razorpay_client import RazorpayClient
from app.models.customer_wallet_topup import CustomerWalletTopup
from sqlalchemy.exc import IntegrityError

router = APIRouter(prefix="/subscriptions", tags=["Subscriptions"])

CUSTOMER_PRICES = {
    "MONTHLY": 199,
    "YEARLY": 1999,
}

# Driver "Pro" tier pricing. Monthly is a flat ₹199. Annual is a
# time-limited launch offer at ₹1000 (a much steeper discount than
# monthly x12 would normally give) - valid only through DRIVER_YEARLY_OFFER_UNTIL;
# after that it reverts to a plain monthly x12 with no discount (no
# separate "regular annual" price was ever specified, so 12x is the
# only defensible non-arbitrary fallback rather than inventing a number).
DRIVER_MONTHLY_PRICE = 199
DRIVER_YEARLY_OFFER_PRICE = 1000
DRIVER_YEARLY_OFFER_UNTIL = date(2026, 12, 12)


def get_driver_prices() -> dict:
    offer_active = date.today() <= DRIVER_YEARLY_OFFER_UNTIL
    yearly = DRIVER_YEARLY_OFFER_PRICE if offer_active else DRIVER_MONTHLY_PRICE * 12
    return {
        "MONTHLY": DRIVER_MONTHLY_PRICE,
        "YEARLY": yearly,
        "yearly_offer_active": offer_active,
        "yearly_offer_until": DRIVER_YEARLY_OFFER_UNTIL.isoformat(),
    }


class SubscribeRequest(BaseModel):
    user_id: str
    plan_type: str  # "MONTHLY" | "YEARLY"


class WalletTopupRequest(BaseModel):
    user_id: str
    user_type: str  # "CUSTOMER" | "DRIVER" | "VEHICLE_OWNER"
    amount: int


@router.post("/wallet/add-money")
def add_mock_wallet_money(payload: WalletTopupRequest, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    """Manual wallet credit for support/testing use - Owner, or Staff with
    finance/payment_release access. This used to have NO auth at all and
    trusted a client-supplied user_id, i.e. anyone who found the URL could
    credit unlimited free wallet balance to any customer/driver/vehicle-
    owner account and then spend it via the real /subscribe endpoints
    below - a live, unauthenticated free-money bug in production. Gated to
    admin so it stays usable as a support tool without being a public
    backdoor. Real self-serve top-up is POST /subscriptions/wallet/topup
    (+ /topup/verify), which goes through actual Razorpay payment."""
    from app.api.routes.admin import require_payment_release_permission
    require_payment_release_permission(current_admin)
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")

    if payload.user_type == "CUSTOMER":
        c = db.query(CustomerDetails).filter(CustomerDetails.customer_id == payload.user_id).first()
        if not c:
            c = CustomerDetails(customer_id=payload.user_id, full_name="Customer", primary_number=payload.user_id, wallet_balance=0)
            db.add(c)
        c.wallet_balance = (c.wallet_balance or 0) + payload.amount
        db.commit()
        new_balance = c.wallet_balance

    elif payload.user_type == "DRIVER":
        d = db.query(CarDriver).filter(CarDriver.id == payload.user_id).first()
        if not d:
            raise HTTPException(status_code=404, detail="Driver not found")
        d.wallet_balance = (d.wallet_balance or 0) + payload.amount
        db.commit()
        new_balance = d.wallet_balance

    elif payload.user_type == "VEHICLE_OWNER":
        # Routed through the real credit_wallet (writes a proper
        # WalletLedger entry) instead of mutating wallet_balance directly -
        # a bare balance write here would silently desync from
        # reconcile_wallet_balance_from_ledger's ledger-derived total.
        from app.crud.wallet import credit_wallet
        new_balance, _ = credit_wallet(
            db, vehicle_owner_id=payload.user_id, amount=payload.amount,
            reference_type="ADMIN_ADD_MONEY", notes=f"Manual credit by {current_admin.username}",
        )
        db.commit()

    else:
        raise HTTPException(status_code=400, detail="Invalid user_type")

    from app.crud.admin_activity_log import log_admin_action
    log_admin_action(
        db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
        action="WALLET_ADJUST", target_type=payload.user_type.lower(), target_id=payload.user_id,
        details={"amount": payload.amount},
    )
    return {"success": True, "new_balance": new_balance}


@router.post("/customer/subscribe")
def subscribe_customer(payload: SubscribeRequest, db: Session = Depends(get_db), current_customer=Depends(get_current_customer)):
    plan = payload.plan_type.upper()
    if plan not in CUSTOMER_PRICES:
        raise HTTPException(status_code=400, detail="Invalid plan_type. Must be MONTHLY or YEARLY")

    # payload.user_id is accepted for backward compatibility with existing
    # callers but never trusted for identity - always act on the
    # authenticated caller's own account (was previously usable to
    # subscribe/spend wallet balance on ANY account by just passing its id).
    c = db.query(CustomerDetails).filter(CustomerDetails.customer_id == current_customer.id).first()
    if not c:
        c = CustomerDetails(customer_id=current_customer.id, full_name="Subscriber", primary_number=str(current_customer.id), wallet_balance=0)
        db.add(c)

    price = CUSTOMER_PRICES[plan]
    if (c.wallet_balance or 0) < price:
        raise HTTPException(status_code=400, detail=f"Insufficient wallet balance. Plan requires ₹{price}, current balance ₹{c.wallet_balance or 0}")

    c.wallet_balance = (c.wallet_balance or 0) - price
    c.subscription_tier = plan
    now = datetime.now(timezone.utc)
    days = 30 if plan == "MONTHLY" else 365
    c.subscription_expires_at = now + timedelta(days=days)
    c.is_verified_carpooler = True
    db.commit()

    return {
        "success": True,
        "message": f"Successfully subscribed to Customer {plan} plan!",
        "tier": c.subscription_tier,
        "expires_at": c.subscription_expires_at.isoformat(),
        "remaining_wallet_balance": c.wallet_balance,
        "perks": [
            "1-Tap Instant Book at Estimated Fare",
            "In-Place Counter Offer Adjuster",
            "Driver Match Explanation Badge",
            "Verified Carpooler Status Badge",
            "Premium Fast-Track Customer Support",
        ],
    }


@router.get("/customer/status")
def get_customer_subscription_status(db: Session = Depends(get_db), current_customer=Depends(get_current_customer)):
    # Was a plain ?user_id= query param with no auth - anyone could read
    # any customer's wallet balance/subscription state. Now always the
    # authenticated caller's own account.
    c = db.query(CustomerDetails).filter(CustomerDetails.customer_id == current_customer.id).first()
    if not c:
        return {
            "tier": "FREE",
            "is_active": False,
            "wallet_balance": 0,
            "expires_at": None,
            "is_verified_carpooler": False,
        }

    now = datetime.now(timezone.utc)
    is_active = False
    if c.subscription_expires_at:
        is_active = c.subscription_expires_at > now
        if not is_active and c.subscription_tier != "FREE":
            c.subscription_tier = "FREE"
            c.is_verified_carpooler = False
            db.commit()

    return {
        "tier": c.subscription_tier or "FREE",
        "is_active": is_active,
        "wallet_balance": c.wallet_balance or 0,
        "expires_at": c.subscription_expires_at.isoformat() if c.subscription_expires_at else None,
        "is_verified_carpooler": c.is_verified_carpooler or False,
        "auto_renew": c.auto_renew_from_wallet,
    }


@router.post("/driver/subscribe")
def subscribe_driver(payload: SubscribeRequest, db: Session = Depends(get_db), current_driver=Depends(get_current_driver)):
    plan = payload.plan_type.upper()
    driver_prices = get_driver_prices()
    if plan not in ("MONTHLY", "YEARLY"):
        raise HTTPException(status_code=400, detail="Invalid plan_type. Must be MONTHLY or YEARLY")

    # payload.user_id accepted but not trusted - see subscribe_customer's
    # comment above for why (was spend-on-any-account otherwise).
    d = db.query(CarDriver).filter(CarDriver.id == current_driver.id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Driver account not found")

    price = driver_prices[plan]
    if (d.wallet_balance or 0) < price:
        raise HTTPException(status_code=400, detail=f"Insufficient wallet balance. Plan requires ₹{price}, current balance ₹{d.wallet_balance or 0}")

    d.wallet_balance = (d.wallet_balance or 0) - price
    d.subscription_tier = plan
    now = datetime.now(timezone.utc)
    days = 30 if plan == "MONTHLY" else 365
    d.subscription_expires_at = now + timedelta(days=days)

    # This driver's Pro subscription is exactly the "Become a Trusted
    # Partner from Settings > Subscription" the posting-gate error message
    # (order_assignments.py) already promises - grant the owner Trusted
    # Partner status for as long as this Pro plan stays active, instead of
    # leaving it as a disconnected perk-only purchase (bug reported
    # 2026-09-30: driver paid for the monthly plan and their account never
    # got marked trusted).
    owner_details = db.query(VehicleOwnerDetails).filter(
        VehicleOwnerDetails.vehicle_owner_id == d.vehicle_owner_id
    ).first()
    if owner_details:
        owner_details.driver_pro_trusted_until = d.subscription_expires_at
        db.add(owner_details)

    db.commit()

    return {
        "success": True,
        "message": f"Driver successfully upgraded to {plan} tier!",
        "tier": d.subscription_tier,
        "expires_at": d.subscription_expires_at.isoformat(),
        "remaining_wallet_balance": d.wallet_balance,
        "perks": [
            "Priority Visibility on High-Value Outstation Trips",
            "Subscriber-Only Deep Earnings Analytics",
            "Empty-Return Route Priority Matching",
            "Customizable Alert Notification Toggles",
        ],
    }


@router.get("/driver/status")
def get_driver_subscription_status(db: Session = Depends(get_db), current_driver=Depends(get_current_driver)):
    # pricing is included here (rather than a separate endpoint) so the
    # Subscription screen has a single source of truth for what it will
    # actually be charged - it used to hardcode ₹299/₹2999 in the UI with
    # no relation at all to a real price source, which could drift from
    # whatever this endpoint (and subscribe_driver above) actually charge.
    pricing = get_driver_prices()
    d = db.query(CarDriver).filter(CarDriver.id == current_driver.id).first()
    if not d:
        return {
            "tier": "FREE",
            "is_active": False,
            "wallet_balance": 0,
            "expires_at": None,
            "pricing": pricing,
        }

    now = datetime.now(timezone.utc)
    is_active = False
    if d.subscription_expires_at:
        is_active = d.subscription_expires_at > now
        if not is_active and d.subscription_tier != "FREE":
            d.subscription_tier = "FREE"
            db.commit()

    return {
        "tier": d.subscription_tier or "FREE",
        "is_active": is_active,
        "wallet_balance": d.wallet_balance or 0,
        "expires_at": d.subscription_expires_at.isoformat() if d.subscription_expires_at else None,
        "auto_renew": d.auto_renew_from_wallet,
        "pricing": pricing,
    }


# ============ REAL CUSTOMER WALLET TOP-UP (Razorpay) ============
# Same create-order -> checkout -> verify-signature pattern as
# customer_bookings.py's pay/verify and TaxiFlowContext.tsx's DropBid
# advance payment. Replaces the Customer App's previous wallet.tsx, which
# only did local setState("Add ₹500" credited a number in memory, nothing
# was ever actually charged or persisted).

class WalletTopupCreateRequest(BaseModel):
    amount: int  # rupees


class WalletTopupVerifyRequest(BaseModel):
    rp_order_id: str
    rp_payment_id: str
    rp_signature: str


@router.post("/wallet/topup")
def create_wallet_topup_order(payload: WalletTopupCreateRequest, current_customer=Depends(get_current_customer)):
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")
    client = RazorpayClient()
    try:
        order = client.create_order(
            amount_paise=payload.amount,
            currency="INR",
            notes={"customer_id": str(current_customer.id), "purpose": "wallet_topup"},
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Razorpay error: {str(e)}")
    return {"rp_order_id": order.get("id"), "amount": order.get("amount")}


@router.post("/wallet/topup/verify")
def verify_wallet_topup(payload: WalletTopupVerifyRequest, db: Session = Depends(get_db), current_customer=Depends(get_current_customer)):
    if not RazorpayClient.verify_signature(payload.rp_order_id, payload.rp_payment_id, payload.rp_signature):
        raise HTTPException(status_code=400, detail="Invalid Razorpay signature")

    # Credit whatever Razorpay confirms was actually paid on this order,
    # never a client-supplied amount - verify_signature only proves the
    # payment belongs to this order/payment id pair, it does not bind any
    # particular amount, so trusting a request-body "amount" here would let
    # someone pay ₹10 for a real order and then claim any credit they like.
    client = RazorpayClient()
    try:
        order = client.get_order(payload.rp_order_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not confirm payment with Razorpay: {str(e)}")
    if order.get("status") != "paid" or (order.get("amount_paid") or 0) <= 0:
        raise HTTPException(status_code=400, detail="Payment not confirmed as paid by Razorpay")
    if str(order.get("notes", {}).get("customer_id")) != str(current_customer.id):
        raise HTTPException(status_code=403, detail="This order does not belong to your account")
    credited_amount = order["amount_paid"] // 100  # paise -> rupees

    # rp_order_id is UNIQUE on this table - a replayed verify call for an
    # order already credited (same valid signature, called again) hits an
    # IntegrityError here instead of crediting the wallet a second time.
    try:
        db.add(CustomerWalletTopup(
            customer_id=current_customer.id,
            rp_order_id=payload.rp_order_id,
            rp_payment_id=payload.rp_payment_id,
            amount=credited_amount,
        ))
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="This payment has already been credited to your wallet")

    c = db.query(CustomerDetails).filter(CustomerDetails.customer_id == current_customer.id).first()
    if not c:
        c = CustomerDetails(customer_id=current_customer.id, full_name="Customer", primary_number=str(current_customer.id), wallet_balance=0)
        db.add(c)

    c.wallet_balance = (c.wallet_balance or 0) + credited_amount
    db.commit()
    db.refresh(c)
    return {"success": True, "new_balance": c.wallet_balance}
