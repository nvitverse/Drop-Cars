"""Recover Razorpay payments the app never confirmed.

Cause of "I paid but nothing happened": after paying, the driver's app must call our /verify endpoint. If the phone loses
network / the app is closed right at that moment, Razorpay has the money but our database still says CREATED - so the wallet
is not credited and the member is not made Trusted. This runs from the sweep: it asks Razorpay about every recent CREATED
order and finishes the job (yearly fee -> activate membership; wallet top-up -> credit the wallet). Idempotent: a payment id
already in the wallet ledger is never credited twice.
"""
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

WINDOW_DAYS = 3          # only recent orders - older ones are handled by a person (never surprise-credit an old payment)
MIN_AGE_MINUTES = 3      # give the app a chance to confirm first
MAX_PER_RUN = 40         # Razorpay lookups per run

# Orders that were opened and never paid stay CREATED for good. The old code took the 25 OLDEST of them on every run, so once more
# than 25 abandoned orders piled up in the window, the oldest ones used up every run and a NEWER order that really was paid was never
# reached ("I paid, nothing activated"). Now: newest first, and an order Razorpay said "not paid" is asked about less and less often.
_unpaid_seen: dict = {}


def _recheck_gap_seconds(age_minutes: float) -> int:
    if age_minutes < 30:
        return 0                 # a fresh order may be paid any second: look every run
    if age_minutes < 360:
        return 30 * 60
    return 3 * 3600


def _pick_orders_to_check(rows, now, seen=None):
    """Newest first; skip orders Razorpay recently said were unpaid (see _recheck_gap_seconds). Returns at most MAX_PER_RUN."""
    seen = _unpaid_seen if seen is None else seen
    out = []
    for txn in rows:
        age_min = (now - txn.created_at).total_seconds() / 60
        last = seen.get(txn.rp_order_id)
        if last is not None and (now - last).total_seconds() < _recheck_gap_seconds(age_min):
            continue
        out.append(txn)
        if len(out) >= MAX_PER_RUN:
            break
    return out


def reconcile_razorpay_payments(db: Session) -> dict:
    from app.models.razorpay_transactions import RazorpayTransaction, RazorpayPaymentStatusEnum
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    from app.utils.razorpay_client import RazorpayClient
    from app.crud.wallet import credit_wallet, check_rp_payment_already_processed
    from app.crud.billing import activate_membership
    from app.utils.razorpay_fees import net_from_charged

    now = datetime.now(timezone.utc)
    rows = (
        db.query(RazorpayTransaction)
        .filter(RazorpayTransaction.status == RazorpayPaymentStatusEnum.CREATED)
        .filter(RazorpayTransaction.created_at >= now - timedelta(days=WINDOW_DAYS))
        .filter(RazorpayTransaction.created_at <= now - timedelta(minutes=MIN_AGE_MINUTES))
        .order_by(RazorpayTransaction.created_at.desc())
        .limit(400)
        .all()
    )
    rows = _pick_orders_to_check(rows, now)
    out = {"checked": len(rows), "membership_activated": 0, "wallet_credited": 0, "errors": 0}
    if not rows:
        return out
    client = RazorpayClient()
    for txn in rows:
        try:
            pays = client.get_order_payments(txn.rp_order_id).get("items", [])
            paid = next((p for p in pays if p.get("status") == "captured"), None)
            if not paid:
                _unpaid_seen[txn.rp_order_id] = now
                continue
            _unpaid_seen.pop(txn.rp_order_id, None)
            payment_id = paid["id"]
            if check_rp_payment_already_processed(db, payment_id):
                txn.status, txn.captured, txn.rp_payment_id = RazorpayPaymentStatusEnum.CAPTURED, True, payment_id
                db.commit()
                continue
            order = client.get_order(txn.rp_order_id)
            purpose = (((order.get("notes") or {}).get("purpose") or getattr(txn, "notes", None) or "")).lower()
            txn.rp_payment_id = payment_id
            txn.rp_signature = "reconciled-from-razorpay"
            txn.status = RazorpayPaymentStatusEnum.CAPTURED
            txn.captured = True
            db.add(txn)
            if purpose == "registration_fee":
                details = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == txn.vehicle_owner_id).first()
                if details is not None:
                    activate_membership(db, details)
                    out["membership_activated"] += 1
            else:
                credit_wallet(db, vehicle_owner_id=str(txn.vehicle_owner_id), amount=net_from_charged(db, txn.amount / 100),
                              reference_id=payment_id, reference_type="RAZORPAY_PAYMENT",
                              notes="Wallet top-up via Razorpay (recovered automatically)")
                out["wallet_credited"] += 1
            db.commit()
            if purpose.startswith("subscription_"):          # the payment was a subscription purchase: finish that too
                from app.crud.billing import activate_plan_from_payment
                if activate_plan_from_payment(db, txn.vehicle_owner_id, purpose.split("_", 1)[1]):
                    out["membership_activated"] += 1
        except Exception as e:  # noqa: BLE001
            db.rollback()
            out["errors"] += 1
            logger.warning("razorpay reconcile failed for order %s: %s", getattr(txn, "rp_order_id", "?"), e)
    return out
