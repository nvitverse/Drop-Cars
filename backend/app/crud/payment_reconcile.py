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
MAX_PER_RUN = 25


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
        .order_by(RazorpayTransaction.created_at.asc())
        .limit(MAX_PER_RUN)
        .all()
    )
    out = {"checked": len(rows), "membership_activated": 0, "wallet_credited": 0, "errors": 0}
    if not rows:
        return out
    client = RazorpayClient()
    for txn in rows:
        try:
            pays = client.get_order_payments(txn.rp_order_id).get("items", [])
            paid = next((p for p in pays if p.get("status") == "captured"), None)
            if not paid:
                continue
            payment_id = paid["id"]
            if check_rp_payment_already_processed(db, payment_id):
                txn.status, txn.captured, txn.rp_payment_id = RazorpayPaymentStatusEnum.CAPTURED, True, payment_id
                db.commit()
                continue
            order = client.get_order(txn.rp_order_id)
            purpose = ((order.get("notes") or {}).get("purpose") or "").lower()
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
        except Exception as e:  # noqa: BLE001
            db.rollback()
            out["errors"] += 1
            logger.warning("razorpay reconcile failed for order %s: %s", getattr(txn, "rp_order_id", "?"), e)
    return out
