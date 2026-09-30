"""Make people who PAID the yearly amount Trusted (Preferred) members.

Finds owners with a captured Razorpay payment of at least the yearly fee who are still not members (no registration_fee_paid_at
and no billing_next_date). For each:
  * if the payment went into the WALLET (a RAZORPAY_PAYMENT ledger credit exists for it) and the wallet still holds the fee,
    the fee is taken from the wallet (ledger entry BILLING_YEARLY_FEE) and the member is activated
  * if the payment already went to the fee (no wallet credit) or the wallet no longer holds it, the member is just activated
Activation = registration_fee_paid_at set, billing_next_date = start + 1 year - 1 day, suspension lifted.

  python scripts/fix_paid_members.py                         -> PREVIEW (nothing changed)
  python scripts/fix_paid_members.py --start 2026-09-25 --apply

Run with the REAL DB_HOST / DB_PASSWORD (backend/.env points at a fake local database).
"""
import argparse
import sys
import uuid
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402
from app.database.session import SessionLocal  # noqa: E402
from app.models.vehicle_owner_details import VehicleOwnerDetails  # noqa: E402
from app.models.wallet_ledger import WalletLedger, WalletEntryTypeEnum  # noqa: E402
from app.crud.billing import get_billing_settings, activate_membership  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--start", help="first day of the new year, YYYY-MM-DD (default: today)")
ap.add_argument("--apply", action="store_true")
a = ap.parse_args()

db = SessionLocal()
try:
    fee = int(get_billing_settings(db)["yearly_fee"] or 1000)
    start = date.fromisoformat(a.start) if a.start else date.today()
    rows = db.execute(text("""
        select d.vehicle_owner_id::text as oid, d.full_name, d.wallet_balance, t.rp_payment_id, t.amount/100 as paid
        from razorpay_transactions t
        join vehicle_owner_details d on d.vehicle_owner_id = t.vehicle_owner_id
        where t.captured = true and t.amount/100 >= :fee
          and d.registration_fee_paid_at is null and d.billing_next_date is null
        order by t.created_at desc
    """), {"fee": fee}).fetchall()
    seen = set()
    plan = []
    for r in rows:
        if r.oid in seen:
            continue
        seen.add(r.oid)
        credited = db.execute(text("select 1 from wallet_ledger where reference_id = :p and reference_type = 'RAZORPAY_PAYMENT' limit 1"),
                              {"p": r.rp_payment_id}).first() is not None
        debit = bool(credited and (r.wallet_balance or 0) >= fee)
        plan.append((r.oid, r.full_name, r.paid, r.wallet_balance, "wallet top-up" if credited else "fee payment", debit))
    print(f"yearly fee: Rs {fee}; new year starts {start}; members to activate: {len(plan)}")
    for oid, name, paid, bal, kind, debit in plan:
        print(f"  {name:22} paid Rs {paid} ({kind}); wallet Rs {bal} -> {'take Rs %d from wallet + ' % fee if debit else ''}activate")
    if not a.apply:
        print("\nPREVIEW ONLY - nothing was changed. Add --apply to do it.")
        sys.exit(0)
    for oid, name, paid, bal, kind, debit in plan:
        d = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == oid).first()
        if debit:
            before = d.wallet_balance or 0
            d.wallet_balance = before - fee
            db.add(WalletLedger(
                vehicle_owner_id=d.vehicle_owner_id, reference_id=str(uuid.uuid4()), reference_type="BILLING_YEARLY_FEE",
                entry_type=WalletEntryTypeEnum.DEBIT, amount=fee, balance_before=before, balance_after=before - fee,
                notes="Yearly membership fee - taken from the wallet payment made earlier",
            ))
        activate_membership(db, d, start=start)
    db.commit()
    print(f"\nAPPLIED to {len(plan)} members.")
finally:
    db.close()
